import { randomUUID } from 'node:crypto'
import type { ServerEnv } from '../../config/env.js'
import { DomainError } from '../../shared/errors.js'
import type { PaymentGateway } from '../payments/payment-gateway.js'
import type { TicketGateway } from '../tickets/ticket-gateway.js'
import { OrderRepository } from './order-repository.js'
import type { CreateOrderInput, Order, PaymentEvent } from './order-types.js'

export class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly tickets: TicketGateway,
    private readonly payments: PaymentGateway,
    private readonly env: ServerEnv,
  ) {}

  async getActiveRaffle() {
    return this.tickets.getActiveRaffle()
  }

  async getAvailableTickets(raffleId: string) {
    return this.tickets.getAvailableTickets(raffleId)
  }

  async createOrder(input: CreateOrderInput) {
    const raffle = await this.tickets.getActiveRaffle()
    if (raffle.id !== input.raffleId)
      throw new DomainError('O sorteio informado não está ativo.', 409)

    const available = await this.tickets.getAvailableTickets(raffle.id)
    const requestedIds = new Set(input.cardIds)
    if (requestedIds.size !== input.cardIds.length) {
      throw new DomainError('A seleção contém cartelas repetidas.')
    }
    const items = available.filter((ticket) => requestedIds.has(ticket.id))
    if (items.length !== requestedIds.size) {
      throw new DomainError('Uma ou mais cartelas não estão disponíveis.', 409)
    }

    const now = new Date()
    const order: Order = {
      id: randomUUID(),
      raffleId: raffle.id,
      raffleTitle: raffle.title,
      status: 'pending',
      totalInCents: raffle.priceInCents * items.length,
      customer: input.customer,
      items,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.env.ORDER_EXPIRATION_MINUTES * 60_000).toISOString(),
    }
    return this.repository.create(order)
  }

  async createCheckout(orderId: string) {
    const order = this.requireOrder(orderId)
    if (order.status !== 'pending') {
      throw new DomainError('Este pedido não está disponível para pagamento.', 409)
    }
    if (order.checkoutUrl) return order.checkoutUrl
    const url = await this.payments.createCheckout(order)
    this.repository.setCheckout(order.id, url)
    return url
  }

  getOrder(orderId: string) {
    return this.requireOrder(orderId)
  }

  acceptWebhook(event: PaymentEvent) {
    const order = this.requireOrder(event.order_nsu)
    if (order.status === 'paid') return
    if (event.amount !== order.totalInCents) {
      throw new DomainError('Valor do pagamento não corresponde ao pedido.', 400)
    }
    this.repository.enqueuePaymentEvent(event)
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
    if (order.status === 'paid') return
    const verification = await this.payments.verifyPayment({
      orderId: order.id,
      transactionNsu: event.transaction_nsu,
      invoiceSlug: event.invoice_slug,
    })
    if (!verification.paid) return
    if (verification.amountInCents !== order.totalInCents) {
      this.repository.markManualReview(order.id, 'Pagamento confirmado com valor divergente.')
      throw new DomainError('Pagamento com valor divergente.', 409)
    }

    this.repository.markProcessing(order.id, event)
    try {
      await this.tickets.fulfillOrder({ ...order, status: 'processing' })
      this.repository.markPaid(order.id)
    } catch (error) {
      this.repository.markManualReview(
        order.id,
        error instanceof Error ? error.message : 'Falha ao validar cartelas.',
      )
      throw error
    }
  }

  private requireOrder(orderId: string) {
    const order = this.repository.get(orderId)
    if (!order) throw new DomainError('Pedido não encontrado.', 404)
    return order
  }
}
