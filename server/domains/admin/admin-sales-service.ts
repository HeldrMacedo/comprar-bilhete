import { z } from 'zod'
import { DomainError } from '../../shared/errors.js'
import type { OrderRepository } from '../orders/order-repository.js'
import type { OrderService } from '../orders/order-service.js'
import type { Order } from '../orders/order-types.js'
import type { AdminRepository } from './admin-repository.js'
import type { AdminSession } from './admin-auth-service.js'
import type {
  AdminSalesRepository,
  CustomerFilters,
  Page,
  SalesFilters,
} from './admin-sales-repository.js'
import { formatCentsForCsv, formatDateForCsv, toCsv } from './csv.js'

export const orderActionInputSchema = z
  .object({ reason: z.string().trim().min(5, 'Informe o motivo (mínimo 5 caracteres).').max(500) })
  .strict()

const STATUS_LABELS: Record<Order['status'], string> = {
  pending: 'Pendente',
  processing: 'Processando',
  paid: 'Pago',
  expired: 'Expirado',
  cancelled: 'Cancelado',
  manual_review: 'Em análise',
}

const EXPORT_LIMIT = 20_000

export class AdminSalesService {
  constructor(
    private readonly sales: AdminSalesRepository,
    private readonly orders: OrderRepository,
    private readonly orderService: OrderService,
    private readonly audit: AdminRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  listOrders(filters: SalesFilters, page: Page) {
    this.orders.expirePending()
    return this.sales.searchOrders(filters, page)
  }

  listCustomers(filters: CustomerFilters, page: Page) {
    return this.sales.searchCustomers(filters, page)
  }

  async approve(actor: AdminSession, orderId: string, reason: string) {
    const before = this.requireOrder(orderId)
    const order =
      before.status === 'manual_review'
        ? await this.orderService.retryManualReview(orderId)
        : await this.orderService.approvePending(orderId)
    this.record(actor, 'order.approve', orderId, {
      reason,
      previousStatus: before.status,
      resultStatus: order.status,
      ...(order.status === 'manual_review' ? { error: order.lastError } : {}),
    })
    return order
  }

  async cancel(actor: AdminSession, orderId: string, reason: string) {
    const before = this.requireOrder(orderId)
    const order = await this.orderService.cancelByAdmin(orderId)
    this.record(actor, 'order.cancel', orderId, { reason, previousStatus: before.status })
    return order
  }

  exportOrders(actor: AdminSession, filters: SalesFilters) {
    this.orders.expirePending()
    const rows: string[][] = []
    for (const order of this.sales.iterateOrders(filters)) {
      if (rows.length >= EXPORT_LIMIT) {
        throw new DomainError(
          `A exportação passa de ${EXPORT_LIMIT} pedidos. Refine os filtros.`,
          413,
          'EXPORT_TOO_LARGE',
        )
      }
      rows.push([
        order.id,
        formatDateForCsv(order.createdAt),
        STATUS_LABELS[order.status],
        order.customer.name,
        order.customer.cpf,
        order.customer.phone,
        order.customer.beneficiaryName ?? '',
        [...new Set(order.items.map((item) => item.raffleTitle ?? order.raffleTitle))].join(' | '),
        order.items.map((item) => item.code).join(' | '),
        String(order.items.length),
        formatCentsForCsv(order.totalInCents),
        formatCentsForCsv(order.paidAmountInCents),
        order.captureMethod ?? '',
        formatDateForCsv(order.paidAt),
        order.lastError ?? '',
      ])
    }
    this.record(actor, 'sales.export', undefined, { filters, rows: rows.length })
    return toCsv(
      [
        'Pedido',
        'Data',
        'Status',
        'Cliente',
        'CPF',
        'Celular',
        'Concorre em nome de',
        'Sorteios',
        'Bilhetes',
        'Quantidade',
        'Total (R$)',
        'Valor pago (R$)',
        'Pagamento',
        'Pago em',
        'Observação',
      ],
      rows,
    )
  }

  exportCustomers(actor: AdminSession, filters: CustomerFilters) {
    const { customers, total } = this.sales.searchCustomers(filters)
    if (total > EXPORT_LIMIT) {
      throw new DomainError(
        `A exportação passa de ${EXPORT_LIMIT} clientes. Refine os filtros.`,
        413,
        'EXPORT_TOO_LARGE',
      )
    }
    this.record(actor, 'customers.export', undefined, { filters, rows: customers.length })
    return toCsv(
      [
        'Nome',
        'CPF',
        'Celular',
        'CEP',
        'Endereço',
        'Número',
        'Complemento',
        'Bairro',
        'Cidade',
        'UF',
        'Pedidos',
        'Pedidos pagos',
        'Bilhetes pagos',
        'Total pago (R$)',
        'Primeiro pedido',
        'Último pedido',
      ],
      customers.map((customer) => [
        customer.name,
        customer.cpf,
        customer.phone,
        customer.address?.zipCode,
        customer.address?.street,
        customer.address?.number,
        customer.address?.complement,
        customer.address?.neighborhood,
        customer.address?.city,
        customer.address?.state,
        customer.orderCount,
        customer.paidOrderCount,
        customer.ticketCount,
        formatCentsForCsv(customer.paidTotalInCents),
        formatDateForCsv(customer.firstOrderAt),
        formatDateForCsv(customer.lastOrderAt),
      ]),
    )
  }

  private requireOrder(orderId: string) {
    const order = this.orders.get(orderId)
    if (!order) throw new DomainError('Pedido nao encontrado.', 404)
    return order
  }

  private record(
    actor: AdminSession,
    action: string,
    targetId: string | undefined,
    details: Record<string, unknown>,
  ) {
    this.audit.recordAudit({
      userId: actor.user.id,
      action,
      ...(targetId ? { targetId } : {}),
      details,
      createdAt: this.now().toISOString(),
    })
  }
}
