import { DomainError } from '../../shared/errors.js'
import type { Order, Ticket } from '../orders/order-types.js'
import type {
  ContestAdminGateway,
  ContestSlot,
  ContestSource,
  ContestValues,
} from './contest-admin-gateway.js'
import type { Raffle, TicketGateway } from './ticket-gateway.js'

const raffle: Raffle = {
  id: 'sorteio-setembro',
  title: 'Sorteio Especial de Setembro',
  description: 'Escolha seu bilhete da sorte e concorra no próximo sorteio.',
  prize: 'R$ 10.000 em prêmios',
  drawDate: '2026-09-30T21:00:00.000Z',
  priceInCents: 1000,
  purchaseEnabled: true,
  prizes: ['1 AVELLOZ AZ1', '1 AVELLOZ AZ1', '1 AVELLOZ AZ1', '1 HONDA START 160 + 20 MIL'],
  luckySpins: { count: 10, label: 'R$ 300,00' },
  doubleChance: true,
}

const sundayRaffle: Raffle = {
  id: 'sorteio-domingo',
  title: 'Sorteio de Domingo',
  description: 'Escolha seu bilhete para o sorteio de domingo.',
  prize: 'R$ 5.000 em prêmios',
  drawDate: '2026-10-04T23:00:00.000Z',
  priceInCents: 600,
  purchaseEnabled: true,
  prizes: ['R$: 3 MIL REAIS', 'R$: 3 MIL REAIS', 'R$: 3 MIL REAIS', '1 HONDA BROS 160 0KM'],
  doubleChance: true,
}

const raffles = [raffle, sundayRaffle]

// Fuso dos sorteios (America/Fortaleza, UTC-3) para converter entre ISO e hora local.
function toLocalParts(iso: string) {
  const local = new Date(Date.parse(iso) - 3 * 60 * 60_000).toISOString()
  return { date: local.slice(0, 10), time: local.slice(11, 16), dateTime: local.slice(0, 16) }
}

function fromLocal(dateTime: string) {
  return new Date(`${dateTime}:00-03:00`).toISOString()
}

const tickets: Ticket[] = Array.from({ length: 48 }, (_, index) => ({
  id: `card-${String(index + 1).padStart(3, '0')}`,
  code: `#${String(index + 1).padStart(3, '0')}`,
  numbers: Array.from(
    { length: 10 },
    (__, numberIndex) => ((index * 7 + numberIndex * 13) % 90) + 1,
  ).sort((a, b) => a - b),
  secondChanceNumbers: Array.from(
    { length: 10 },
    (__, numberIndex) => ((index * 11 + numberIndex * 17) % 90) + 1,
  ).sort((a, b) => a - b),
  identification: `6041008${String(index + 1).padStart(4, '0')}-${String((index * 37) % 100).padStart(2, '0')}`,
  validationBatch: 'mock',
  batchPosition: index + 1,
}))

const SOURCES: Array<{ source: ContestSource; raffleId: string }> = [
  { source: 'cap', raffleId: raffle.id },
  { source: 'esp', raffleId: sundayRaffle.id },
]

export class MockTicketGateway implements TicketGateway, ContestAdminGateway {
  private readonly soldTickets = new Set<string>()
  // Cada instância edita a própria cópia: testes e o painel em modo mock não se afetam.
  private readonly raffles = structuredClone(raffles)
  private readonly salesStart = new Map<string, string>()

  async getActiveRaffles() {
    return structuredClone(this.raffles)
  }

  async getActiveRaffle() {
    return structuredClone(this.raffles[0]!)
  }

  async listContests() {
    return SOURCES.map(({ source, raffleId }) => this.toSlot(source, this.requireRaffle(raffleId)))
  }

  async updateContest(source: ContestSource, values: ContestValues) {
    const raffleId = SOURCES.find((item) => item.source === source)?.raffleId
    if (!raffleId) throw new DomainError('Este sorteio não está disponível para edição.', 404)
    const current = this.requireRaffle(raffleId)
    Object.assign(current, {
      drawDate: fromLocal(`${values.drawDate}T${values.drawTime}`),
      salesEndAt: fromLocal(values.salesEndAt),
      priceInCents: values.priceInCents,
      prize: values.prizes[0],
      prizes: [...values.prizes],
      doubleChance: values.doubleChance,
    })
    if (values.luckySpinsCount > 0) {
      current.luckySpins = { count: values.luckySpinsCount, label: values.luckySpinsLabel }
    } else {
      delete current.luckySpins
    }
    this.salesStart.set(raffleId, values.salesStartAt)
    return this.toSlot(source, current)
  }

  private requireRaffle(raffleId: string) {
    const found = this.raffles.find((item) => item.id === raffleId)
    if (!found) throw new DomainError('Sorteio não encontrado.', 404)
    return found
  }

  private toSlot(source: ContestSource, current: Raffle): ContestSlot {
    const draw = toLocalParts(current.drawDate)
    const salesEnd = toLocalParts(
      current.salesEndAt ?? new Date(Date.parse(current.drawDate) - 60 * 60_000).toISOString(),
    )
    const salesStart = toLocalParts(
      new Date(Date.parse(current.drawDate) - 30 * 86_400_000).toISOString(),
    )
    return {
      source,
      contestId: current.id,
      salesStartAt: this.salesStart.get(current.id) ?? salesStart.dateTime,
      salesEndAt: salesEnd.dateTime,
      drawDate: draw.date,
      drawTime: draw.time,
      priceInCents: current.priceInCents,
      prizes: current.prizes ?? [current.prize],
      luckySpinsCount: current.luckySpins?.count ?? 0,
      luckySpinsLabel: current.luckySpins?.label ?? '',
      doubleChance: current.doubleChance ?? false,
    }
  }

  async getAvailableTickets(raffleId: string) {
    if (!this.raffles.some((item) => item.id === raffleId)) {
      throw new DomainError('Sorteio não encontrado.', 404)
    }
    return structuredClone(
      tickets.filter((ticket) => !this.soldTickets.has(`${raffleId}:${ticket.id}`)),
    )
  }

  async getAvailableTicket(raffleId: string, ticketId: string) {
    if (!this.raffles.some((item) => item.id === raffleId)) {
      throw new DomainError('Sorteio não encontrado.', 404)
    }
    const ticket = tickets.find((item) => item.id === ticketId)
    if (!ticket || this.soldTickets.has(`${raffleId}:${ticket.id}`)) return null
    return structuredClone(ticket)
  }

  async fulfillOrder(order: Order) {
    for (const item of order.items) {
      const key = `${item.raffleId ?? order.raffleId}:${item.id}`
      if (this.soldTickets.has(key)) {
        throw new DomainError(`O bilhete ${item.code} não está mais disponível.`, 409)
      }
    }
    for (const item of order.items) {
      this.soldTickets.add(`${item.raffleId ?? order.raffleId}:${item.id}`)
    }
  }
}
