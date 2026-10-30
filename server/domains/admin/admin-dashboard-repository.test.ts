import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type AppDatabase } from '../../shared/database.js'
import { OrderRepository } from '../orders/order-repository.js'
import { order, orderDraft, ticket } from '../orders/order-test-fixtures.js'
import { AdminDashboardRepository } from './admin-dashboard-repository.js'

let database: AppDatabase
afterEach(() => database.close())

describe('AdminDashboardRepository e bilhetes não validados', () => {
  it('exclui bilhetes não validados da receita e soma o valor a estornar', () => {
    database = createDatabase(':memory:')
    const orders = new OrderRepository(database, () => new Date('2026-09-23T10:05:00.000Z'))
    const late = { ...ticket('card-002'), validationStatus: 'not_validated' as const }
    orders.createManual(
      order({
        ...orderDraft('first'),
        status: 'paid',
        paidAt: '2026-09-23T10:05:00.000Z',
        expiresAt: '2030-01-01T00:00:00.000Z',
        items: [ticket('card-001'), late],
        totalInCents: 2000,
      }),
    )
    orders.createManual(
      order({
        ...orderDraft('second'),
        status: 'not_validated',
        paidAt: '2026-09-23T10:05:00.000Z',
        expiresAt: '2030-01-01T00:00:00.000Z',
        items: [
          { ...ticket('card-003'), validationStatus: 'not_validated', unitPriceInCents: 600 },
        ],
        totalInCents: 600,
      }),
    )
    database.prepare("UPDATE orders SET paid_at = '2026-09-23T10:05:00.000Z'").run()
    const dashboard = new AdminDashboardRepository(database)
    expect(dashboard.totals()).toMatchObject({
      paid_tickets: 1,
      revenue_in_cents: 1000,
      refund_due_in_cents: 1600,
    })
    expect(dashboard.dailyPaid('2026-09-01')).toEqual([
      { day: '2026-09-23', revenue_in_cents: 1000, tickets: 1 },
    ])
    expect(dashboard.paidByRaffle()).toMatchObject([{ tickets: 1, revenue_in_cents: 1000 }])
  })
})
