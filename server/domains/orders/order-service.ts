import { randomInt, randomUUID } from 'node:crypto'
import type { ServerEnv } from '../../config/env.js'
import { DomainError } from '../../shared/errors.js'
import { requireTicketApiTls } from '../../shared/ticket-api-tls.js'
import type { CustomerService } from '../customers/customer-service.js'
import type { ResolvedCustomer } from '../customers/customer-types.js'
import type { PaymentGateway } from '../payments/payment-gateway.js'
import type { Raffle, TicketGateway } from '../tickets/ticket-gateway.js'
import { OrderRepository, type PreparedOrderGroup } from './order-repository.js'
import type { CreateOrderInput, Order, OrderDraft, PaymentEvent, Ticket } from './order-types.js'
import type { TicketReservationCoordinator } from './ticket-reservation-coordinator.js'

export class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly tickets: TicketGateway,
    private readonly payments: PaymentGateway,
    private readonly customers: CustomerService,
    private readonly reservations: TicketReservationCoordinator,
    private readonly env: ServerEnv,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getActiveRaffle() {
    return this.tickets.getActiveRaffle()
  }

  async getActiveRaffles() {
    return this.tickets.getActiveRaffles()
  }

  async getAvailableTickets(raffleId: string) {
    return this.tickets.getAvailableTickets(raffleId)
  }

  async createOrder(input: CreateOrderInput) {
    if (this.env.TICKET_PROVIDER === 'live')
      requireTicketApiTls(this.env.TICKET_API_BASE_URL, this.env.TICKET_API_ALLOW_HTTP)
    const customer = await this.customers.resolveForOrder(input.customer)
    if ('raffles' in input) return this.createGroupedOrder(input.raffles, customer)
    const raffle = await this.tickets.getActiveRaffle()
    if (raffle.id !== input.raffleId) {
      throw new DomainError('O sorteio informado nao esta ativo.', 409)
    }

    const now = this.now()
    const quantity =
      input.selection.mode === 'manual' ? input.selection.cardIds.length : input.selection.quantity
    const draft: OrderDraft = {
      id: randomUUID(),
      raffleId: raffle.id,
      raffleTitle: raffle.title,
      selectionMode: input.selection.mode,
      status: 'pending',
      unitPriceInCents: raffle.priceInCents,
      totalInCents: raffle.priceInCents * quantity,
      customer,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.env.ORDER_EXPIRATION_MINUTES * 60_000).toISOString(),
    }

    if (input.selection.mode === 'random') {
      const candidates = shuffle(await this.tickets.getAvailableTickets(raffle.id)).map((ticket) =>
        withRaffleDetails(ticket, raffle),
      )
      return this.holdRemotely(
        this.repository.createRandom(draft, candidates, input.selection.quantity),
      )
    }

    const requestedIds = new Set(input.selection.cardIds)
    if (requestedIds.size !== input.selection.cardIds.length) {
      throw new DomainError('A selecao contem bilhetes repetidas.')
    }
    const items = await Promise.all(
      input.selection.cardIds.map((ticketId) =>
        this.tickets.getAvailableTicket(raffle.id, ticketId),
      ),
    )
    if (!hasOnlyTickets(items)) {
      throw new DomainError(
        'Uma ou mais bilhetes nao estao disponiveis.',
        409,
        'TICKET_UNAVAILABLE',
      )
    }

    const order: Order = {
      ...draft,
      items: items.map((ticket) => withRaffleDetails(ticket, raffle)),
    }
    return this.holdRemotely(this.repository.createManual(order))
  }

  private async createGroupedOrder(
    selections: Extract<CreateOrderInput, { raffles: unknown }>['raffles'],
    customer: ResolvedCustomer,
  ) {
    const ids = selections.map((entry) => entry.raffleId)
    if (new Set(ids).size !== ids.length) {
      throw new DomainError('O mesmo sorteio foi informado mais de uma vez.')
    }

    const activeRaffles = await this.tickets.getActiveRaffles()
    const groups: PreparedOrderGroup[] = await Promise.all(
      selections.map(async ({ raffleId, selection }) => {
        const raffle = activeRaffles.find((entry) => entry.id === raffleId)
        if (!raffle) throw new DomainError('O sorteio informado nao esta ativo.', 409)
        const quantity = selection.mode === 'manual' ? selection.cardIds.length : selection.quantity
        let tickets: Ticket[]
        if (selection.mode === 'random') {
          tickets = shuffle(await this.tickets.getAvailableTickets(raffle.id))
        } else {
          if (new Set(selection.cardIds).size !== selection.cardIds.length) {
            throw new DomainError('A selecao contem bilhetes repetidos.')
          }
          const resolved = await Promise.all(
            selection.cardIds.map((ticketId) =>
              this.tickets.getAvailableTicket(raffle.id, ticketId),
            ),
          )
          if (!hasOnlyTickets(resolved)) {
            throw new DomainError(
              'Uma ou mais bilhetes nao estao disponiveis.',
              409,
              'TICKET_UNAVAILABLE',
            )
          }
          tickets = resolved
        }
        return {
          raffleId: raffle.id,
          raffleTitle: raffle.title,
          unitPriceInCents: raffle.priceInCents,
          mode: selection.mode,
          quantity,
          tickets: tickets.map((ticket) => withRaffleDetails(ticket, raffle)),
        }
      }),
    )

    const now = this.now()
    const totalInCents = groups.reduce(
      (total, group) => total + group.unitPriceInCents * group.quantity,
      0,
    )
    if (!Number.isSafeInteger(totalInCents)) {
      throw new DomainError('Total do pedido inconsistente.', 500, 'INVALID_ORDER_TOTAL')
    }
    const deadlines = activeRaffles
      .filter((raffle) => ids.includes(raffle.id) && raffle.salesEndAt)
      .map((raffle) => Date.parse(raffle.salesEndAt ?? ''))
    const expiresAtMs = Math.min(
      now.getTime() + this.env.ORDER_EXPIRATION_MINUTES * 60_000,
      ...deadlines,
    )
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) {
      throw new DomainError('O sorteio informado nao esta ativo.', 409)
    }
    const first = groups[0]
    if (!first) throw new DomainError('Nenhum sorteio foi selecionado.')
    const draft: OrderDraft = {
      id: randomUUID(),
      raffleId: first.raffleId,
      raffleTitle: first.raffleTitle,
      selectionMode: first.mode,
      status: 'pending',
      unitPriceInCents: first.unitPriceInCents,
      totalInCents,
      customer,
      createdAt: now.toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
    }
    return this.holdRemotely(this.repository.createGrouped(draft, groups))
  }

  private async holdRemotely(order: Order) {
    const outcome = await this.reservations.acquire(order).catch((error: unknown) => {
      this.repository.cancel(order.id)
      throw error
    })
    if (outcome === 'conflict') {
      this.repository.cancel(order.id)
      throw new DomainError('Uma ou mais bilhetes ja estao reservados.', 409, 'TICKET_RESERVED')
    }
    return order
  }

  async releaseAbandonedReservations() {
    this.repository.expirePending()
    return this.reservations.releaseAbandoned()
  }

  async createCheckout(orderId: string) {
    if (this.env.TICKET_PROVIDER === 'live')
      requireTicketApiTls(this.env.TICKET_API_BASE_URL, this.env.TICKET_API_ALLOW_HTTP)
    const order = this.requireOrder(orderId)
    if (order.status !== 'pending') {
      throw new DomainError('Este pedido nao esta disponivel para pagamento.', 409)
    }
    if (order.checkoutUrl) return order.checkoutUrl
    const url = await this.payments.createCheckout(order)
    this.repository.setCheckout(order.id, url)
    return url
  }

  getOrder(orderId: string) {
    return this.requireOrder(orderId)
  }

  listOrdersByCpf(cpf: string) {
    return this.repository.listByCustomerCpf(cpf, 20)
  }

  acceptWebhook(event: PaymentEvent) {
    const order = this.requireOrder(event.order_nsu)
    if (order.status === 'paid') return
    if (event.amount !== order.totalInCents) {
      throw new DomainError('Valor do pagamento nao corresponde ao pedido.', 400)
    }
    return this.repository.enqueuePaymentEvent(event)
  }

  async reconcileRedirect(orderId: string, transactionNsu: string, invoiceSlug: string) {
    const order = this.requireOrder(orderId)
    if (order.status !== 'pending') return order
    const event: PaymentEvent = {
      invoice_slug: invoiceSlug,
      amount: order.totalInCents,
      paid_amount: order.totalInCents,
      installments: 1,
      capture_method: 'unknown',
      transaction_nsu: transactionNsu,
      order_nsu: order.id,
      receipt_url: `${this.env.PUBLIC_APP_URL}/pagamento?order_nsu=${order.id}`,
      items: [],
    }
    await this.reconcile(event)
    return this.requireOrder(orderId)
  }

  async processNextPaymentEvent() {
    const claimed = this.repository.claimPaymentEvent()
    if (!claimed) return false
    try {
      await this.reconcile(claimed.event)
      this.repository.completePaymentEvent(claimed.id)
    } catch (error) {
      this.repository.failPaymentEvent(
        claimed.id,
        error instanceof Error ? error.message : 'Falha desconhecida',
      )
      throw error
    }
    return true
  }

  private async reconcile(event: PaymentEvent) {
    const order = this.requireOrder(event.order_nsu)
    if (['paid', 'processing', 'manual_review'].includes(order.status)) return
    const verification = await this.payments.verifyPayment({
      orderId: order.id,
      transactionNsu: event.transaction_nsu,
      invoiceSlug: event.invoice_slug,
    })
    if (!verification.paid) return
    const verifiedEvent = { ...event, capture_method: verification.captureMethod }
    this.repository.recordPaymentEvidence(verifiedEvent)
    if (verification.amountInCents !== order.totalInCents) {
      this.repository.markManualReview(order.id, 'Pagamento confirmado com valor divergente.')
      return
    }

    if (!this.repository.tryStartProcessing(order.id, order.items.length)) {
      const current = this.requireOrder(order.id)
      if (current.status === 'expired' || current.status === 'cancelled') {
        this.repository.markManualReview(
          order.id,
          'Pagamento confirmado sem reserva ativa; exige analise manual.',
        )
      }
      return
    }

    await this.fulfill(order.id)
  }

  // Aprovação manual de pedido pendente: o administrador confirma o pagamento recebido fora
  // do fluxo automático; a entrega segue o mesmo caminho do webhook.
  async approvePending(orderId: string) {
    const order = this.requireOrder(orderId)
    if (order.status !== 'pending') {
      throw new DomainError('Somente pedidos pendentes podem receber baixa manual.', 409)
    }
    if (!this.repository.tryStartProcessing(order.id, order.items.length)) {
      throw new DomainError(
        'A reserva deste pedido expirou ou foi cancelada; ele não pode mais ser aprovado.',
        409,
        'ORDER_RESERVATION_LOST',
      )
    }
    this.repository.recordManualPayment(order.id)
    await this.fulfill(order.id)
    return this.requireOrder(order.id)
  }

  // Nova tentativa de entrega para pedido em análise. Antes de validar, reconfirma a reserva
  // local e a disponibilidade na API de bilhetes, porque a validação externa não é condicional.
  async retryManualReview(orderId: string) {
    const order = this.requireOrder(orderId)
    if (order.status !== 'manual_review') {
      throw new DomainError('Somente pedidos em análise podem ser reprocessados.', 409)
    }
    for (const item of order.items) {
      const available = await this.tickets.getAvailableTicket(
        item.raffleId ?? order.raffleId,
        item.id,
      )
      if (!available) {
        throw new DomainError(
          `O bilhete ${item.code} não está mais disponível. Cancele o pedido e estorne o pagamento.`,
          409,
          'TICKET_UNAVAILABLE',
        )
      }
    }
    if (!this.repository.claimManualReviewRetry(order.id)) {
      throw new DomainError('O pedido mudou de status. Atualize a lista e tente novamente.', 409)
    }
    if (!order.captureMethod) this.repository.recordManualPayment(order.id)
    await this.fulfill(order.id)
    return this.requireOrder(order.id)
  }

  async cancelByAdmin(orderId: string) {
    const order = this.requireOrder(orderId)
    if (order.status !== 'pending' && order.status !== 'manual_review') {
      throw new DomainError('Somente pedidos pendentes ou em análise podem ser cancelados.', 409)
    }
    if (!this.repository.cancelByAdmin(order.id, order.status)) {
      throw new DomainError('O pedido mudou de status. Atualize a lista e tente novamente.', 409)
    }
    await this.reservations.releaseOrder(order.id)
    return this.requireOrder(order.id)
  }

  private async fulfill(orderId: string) {
    try {
      if (!this.repository.assignBatchPositions(orderId)) {
        this.repository.markManualReview(orderId, 'Falha ao atribuir posicoes de lote.')
        return
      }

      if (!(await this.reservations.confirmOwnership(this.requireOrder(orderId)))) {
        this.repository.markManualReview(
          orderId,
          'Reserva externa da bilhete foi perdida antes da validacao.',
        )
        return
      }
      const updatedOrder = this.requireOrder(orderId)
      const customer = await this.customers.ensureRegistered(updatedOrder.customer)
      await this.tickets.fulfillOrder({ ...updatedOrder, customer, status: 'processing' })
      this.repository.markPaid(orderId)
      this.reservations.markValidated(orderId)
    } catch (error) {
      this.repository.markManualReview(
        orderId,
        error instanceof Error ? error.message : 'Falha ao validar bilhetes.',
      )
    }
  }

  private requireOrder(orderId: string) {
    const order = this.repository.get(orderId)
    if (!order) throw new DomainError('Pedido nao encontrado.', 404)
    return order
  }
}

function shuffle<T>(values: T[]): T[] {
  const shuffled = [...values]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1)
    const current = shuffled[index]
    shuffled[index] = shuffled[target]!
    shuffled[target] = current!
  }
  return shuffled
}

// Cópia do concurso no bilhete: o comprovante não depende do concurso continuar ativo.
function withRaffleDetails(ticket: Ticket, raffle: Raffle): Ticket {
  return {
    ...ticket,
    drawDate: raffle.drawDate,
    ...(raffle.prizes?.length ? { prizes: raffle.prizes } : {}),
    ...(raffle.luckySpins ? { luckySpins: raffle.luckySpins } : {}),
  }
}

function hasOnlyTickets(items: Array<Ticket | null>): items is Ticket[] {
  return items.every((item) => item !== null)
}
