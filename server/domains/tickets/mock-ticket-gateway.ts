import { DomainError } from '../../shared/errors.js'
import type { Order, Ticket } from '../orders/order-types.js'
import type { Raffle, TicketGateway } from './ticket-gateway.js'

const raffle: Raffle = {
  id: 'sorteio-setembro',
  title: 'Sorteio Especial de Setembro',
  description: 'Escolha sua cartela da sorte e concorra no próximo sorteio.',
  prize: 'R$ 10.000 em prêmios',
  drawDate: '2026-09-30T21:00:00.000Z',
  priceInCents: 1000,
}

const tickets: Ticket[] = Array.from({ length: 48 }, (_, index) => ({
  id: `card-${String(index + 1).padStart(3, '0')}`,
  code: `#${String(index + 1).padStart(3, '0')}`,
  numbers: Array.from(
    { length: 10 },
    (__, numberIndex) => ((index * 7 + numberIndex * 13) % 90) + 1,
  ).sort((a, b) => a - b),
  validationBatch: 'mock',
  batchPosition: index + 1,
}))

export class MockTicketGateway implements TicketGateway {
  private readonly soldTickets = new Set<string>()

  async getActiveRaffle() {
    return structuredClone(raffle)
  }

  async getAvailableTickets(raffleId: string) {
    if (raffleId !== raffle.id) throw new DomainError('Sorteio não encontrado.', 404)
    return structuredClone(tickets.filter((ticket) => !this.soldTickets.has(ticket.id)))
  }

  async fulfillOrder(order: Order) {
    for (const item of order.items) {
      if (this.soldTickets.has(item.id)) {
        throw new DomainError(`A cartela ${item.code} não está mais disponível.`, 409)
      }
    }
    for (const item of order.items) this.soldTickets.add(item.id)
  }
}
