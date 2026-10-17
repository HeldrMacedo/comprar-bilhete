import { DomainError } from '../../shared/errors.js'
import { MailDeliveryError, type MailGateway } from '../accounts/mail-gateway.js'
import type { OrderRepository } from '../orders/order-repository.js'
import { buildTicketCards } from './ticket-card.js'
import { renderTicketCardEmail } from './ticket-card-email.js'
import { renderTicketCardsPdf } from './ticket-card-pdf.js'
import type { TicketEmailRepository } from './ticket-email-repository.js'

// Espera antes da 2ª, 3ª, 4ª e 5ª tentativas; a 5ª falha encerra.
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000]

export class TicketEmailService {
  constructor(
    private readonly repository: TicketEmailRepository,
    private readonly orders: OrderRepository,
    private readonly mail: MailGateway,
    private readonly appUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async processNext() {
    const claimed = this.repository.claimNext()
    if (!claimed) return false
    try {
      const order = this.orders.get(claimed.orderId)
      const to = order?.customer.email
      if (!order || !to) {
        this.repository.markNoRecipient(claimed.orderId)
        return true
      }
      const document = buildTicketCards(order, this.appUrl)
      const pdf = await renderTicketCardsPdf(document)
      await this.mail.send({
        to,
        ...renderTicketCardEmail(document),
        attachments: [
          {
            filename: `bilhetes-${document.orderShortId}.pdf`,
            content: pdf,
            contentType: 'application/pdf',
          },
        ],
      })
      this.repository.markSent(order.id)
    } catch (error) {
      // Mensagens livres podem conter dados do cliente: só a classe do erro vai para o registro.
      const attempts = claimed.attempts + 1
      const delay = RETRY_DELAYS_MS[attempts - 1]
      this.repository.markFailedAttempt(
        claimed.orderId,
        attempts,
        delay === undefined ? null : new Date(this.now().getTime() + delay),
        error instanceof MailDeliveryError
          ? error.summary
          : error instanceof Error
            ? `falha ao montar ou enviar o e-mail (${error.name})`
            : 'Falha desconhecida',
      )
    }
    return true
  }

  // Rodada do worker: vários envios por vez para a fila não crescer em picos de venda.
  // Um laço por vez no processo: o worker não espera a rodada anterior terminar.
  private running = false

  async processPending(limit = 10) {
    if (this.running) return 0
    this.running = true
    try {
      let processed = 0
      while (processed < limit && (await this.processNext())) processed += 1
      return processed
    } finally {
      this.running = false
    }
  }

  resend(orderId: string) {
    const order = this.orders.get(orderId)
    if (!order) throw new DomainError('Pedido nao encontrado.', 404)
    if (order.status !== 'paid') {
      throw new DomainError(
        'Só pedidos pagos recebem o e-mail dos bilhetes.',
        409,
        'ORDER_NOT_PAID',
      )
    }
    if (!order.customer.email) {
      throw new DomainError('Este pedido não tem e-mail cadastrado.', 409, 'EMAIL_NO_RECIPIENT')
    }
    if (this.repository.get(orderId)?.status === 'pending') {
      throw new DomainError(
        'O e-mail deste pedido já está na fila de envio.',
        409,
        'EMAIL_ALREADY_QUEUED',
      )
    }
    this.repository.requeue(orderId)
  }

  statusesOf(orderIds: string[]) {
    return this.repository.getStatuses(orderIds)
  }
}
