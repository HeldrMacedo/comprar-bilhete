import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type AppDatabase } from '../../shared/database.js'
import { OrderRepository } from '../orders/order-repository.js'
import { order, orderDraft, ticket } from '../orders/order-test-fixtures.js'
import { AdminSalesRepository } from './admin-sales-repository.js'

let database: AppDatabase
afterEach(() => database.close())

describe('AdminSalesRepository e bilhetes não validados', () => {
  it('exclui bilhetes não validados do total pago e da contagem do cliente', () => {
    database = createDatabase(':memory:')
    const orders = new OrderRepository(database, () => new Date('2026-09-23T10:05:00.000Z'))
    orders.createManual(
      order({
        ...orderDraft('first'),
        status: 'paid',
        expiresAt: '2030-01-01T00:00:00.000Z',
        items: [
          ticket('card-001'),
          { ...ticket('card-002'), validationStatus: 'not_validated', unitPriceInCents: 600 },
        ],
        totalInCents: 1600,
      }),
    )

    const { customers } = new AdminSalesRepository(database).searchCustomers({})

    expect(customers).toMatchObject([{ paidTotalInCents: 1000, ticketCount: 1 }])
  })
})
