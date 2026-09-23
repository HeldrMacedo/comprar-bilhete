import { randomInt, randomUUID } from 'node:crypto'
import type { ServerEnv } from '../../config/env.js'
import { DomainError } from '../../shared/errors.js'
import type { CustomerService } from '../customers/customer-service.js'
import type { PaymentGateway } from '../payments/payment-gateway.js'
import type { TicketGateway } from '../tickets/ticket-gateway.js'
import { OrderRepository } from './order-repository.js'
import type { CreateOrderInput, Order, OrderDraft, PaymentEvent, Ticket } from './order-types.js'

export class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly tickets: TicketGateway,
    private readonly payments: PaymentGateway,
    private readonly customers: CustomerService,
    private readonly env: ServerEnv,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getActiveRaffle() {
    return this.tickets.getActiveRaffle()
  }

  async getAvailableTickets(raffleId: string) {
    return this.tickets.getAvailableTickets(raffleId)
  }

  async createOrder(input: CreateOrderInput) {
    const customer = await this.customers.resolveForOrder(input.customer)
    const raffle = await this.tickets.getActiveRaffle()
    if (raffle.id !== input.raffleId) {
      throw new DomainError('O sorteio informado nao esta ativo.', 409)
    }

    const now = this.now()
    const quantity =
      input.selection.mode === 'manual'
        ? input.selection.cardIds.length
        : input.selection.quantity
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
      expiresAt: new Date(
        now.getTime() + this.env.ORDER_EXPIRATION_MINUTES * 60_000,
      ).toISOString(),
    }

    if (input.selection.mode === 'random') {
      const candidates = shuffle(await this.tickets.getAvailableTickets(raffle.id))
      return this.repository.createRandom(draft, candidates, input.selection.quantity)
    }

    const requestedIds = new Set(input.selection.cardIds)
    if (requestedIds.size !== input.selection.cardIds.length) {
      throw new DomainError('A selecao contem cartelas repetidas.')
    }
    const items = await Promise.all(
      input.selection.cardIds.map((ticketId) =>
        this.tickets.getAvailableTicket(raffle.id, ticketId),
      ),
    )
    if (!hasOnlyTickets(items)) {
      throw new DomainError(
        'Uma ou mais cartelas nao estao disponiveis.',
        409,
        'TICKET_UNAVAILABLE',
      )
    }

    const order: Order = { ...draft, items }
    return this.repository.createManual(order)
  }

  async createCheckout(orderId: string) {
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

    try {
      await this.customers.ensureRegistered(order.customer)
      await this.tickets.fulfillOrder({ ...order, status: 'processing' })
      this.repository.markPaid(order.id)
    } catch (error) {
      this.repository.markManualReview(
        order.id,
        error instanceof Error ? error.message : 'Falha ao validar cartelas.',
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

function hasOnlyTickets(items: Array<Ticket | null>): items is Ticket[] {
  return items.every((item) => item !== null)
}
