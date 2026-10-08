import type { OrderRepository } from '../orders/order-repository.js'
import type { Order } from '../orders/order-types.js'
import type { Raffle } from '../tickets/ticket-gateway.js'
import type { AdminDashboardRepository } from './admin-dashboard-repository.js'

export const DASHBOARD_DAYS = 30

const STATUSES: Array<Order['status']> = [
  'pending',
  'processing',
  'paid',
  'manual_review',
  'expired',
  'cancelled',
]

function localDay(date: Date) {
  return new Date(date.getTime() - 3 * 60 * 60_000).toISOString().slice(0, 10)
}

export class AdminDashboardService {
  constructor(
    private readonly dashboard: AdminDashboardRepository,
    private readonly orders: OrderRepository,
    private readonly activeRaffles: () => Promise<Raffle[]>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async summary() {
    this.orders.expirePending()
    const current = this.now()
    const days = Array.from({ length: DASHBOARD_DAYS }, (_, index) =>
      localDay(new Date(current.getTime() - (DASHBOARD_DAYS - 1 - index) * 86_400_000)),
    )
    const daily = new Map(this.dashboard.dailyPaid(days[0]!).map((row) => [row.day, row]))
    const byStatus = new Map(this.dashboard.ordersByStatus().map((row) => [row.status, row.orders]))
    const paidByRaffle = this.dashboard.paidByRaffle()
    const soldByRaffle = new Map(paidByRaffle.map((row) => [row.raffle_id, row]))
    const totals = this.dashboard.totals()

    // O gateway decide o que está ativo (mesma regra da Home).
    // API de bilhetes fora do ar não derruba o painel: indicadores locais continuam visíveis.
    let upcoming: Array<{
      id: string
      title: string
      drawDate: string
      salesEndAt?: string
      priceInCents: number
      prizes: string[]
      paidTickets: number
      revenueInCents: number
    }> | null = null
    let upcomingError: string | undefined
    try {
      upcoming = (await this.activeRaffles())
        .sort((first, second) => Date.parse(first.drawDate) - Date.parse(second.drawDate))
        .map((raffle) => ({
          id: raffle.id,
          title: raffle.title,
          drawDate: raffle.drawDate,
          ...(raffle.salesEndAt ? { salesEndAt: raffle.salesEndAt } : {}),
          priceInCents: raffle.priceInCents,
          prizes: raffle.prizes ?? [raffle.prize],
          paidTickets: soldByRaffle.get(raffle.id)?.tickets ?? 0,
          revenueInCents: soldByRaffle.get(raffle.id)?.revenue_in_cents ?? 0,
        }))
    } catch {
      upcomingError = 'Não foi possível consultar os sorteios na API de bilhetes.'
    }

    return {
      generatedAt: current.toISOString(),
      totals: {
        customers: totals.customers,
        paidTickets: totals.paid_tickets,
        paidOrders: totals.paid_orders,
        revenueInCents: totals.revenue_in_cents,
        pendingTickets: totals.pending_tickets,
        pendingOrders: totals.pending_orders,
        manualReviewOrders: totals.manual_review_orders,
      },
      dailySales: days.map((day) => ({
        day,
        revenueInCents: daily.get(day)?.revenue_in_cents ?? 0,
        tickets: daily.get(day)?.tickets ?? 0,
      })),
      ordersByStatus: STATUSES.map((status) => ({ status, orders: byStatus.get(status) ?? 0 })),
      ticketsByRaffle: paidByRaffle.map((row) => ({
        raffleId: row.raffle_id,
        raffleTitle: row.raffle_title,
        tickets: row.tickets,
        revenueInCents: row.revenue_in_cents,
      })),
      upcomingRaffles: upcoming,
      ...(upcomingError ? { upcomingRafflesError: upcomingError } : {}),
    }
  }
}
