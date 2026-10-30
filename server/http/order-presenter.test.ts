import { describe, expect, it } from 'vitest'
import { order, ticket } from '../domains/orders/order-test-fixtures.js'
import { presentAdminOrder } from './admin-presenter.js'
import { presentPurchase } from './order-presenter.js'

const notValidated = {
  ...ticket('card-001'),
  salesEndAt: '2026-09-23T10:00:00.000Z',
  validationStatus: 'not_validated' as const,
  identification: 'X-1',
}
const valid = {
  ...ticket('card-002'),
  salesEndAt: '2026-09-24T10:00:00.000Z',
  identification: 'X-2',
}

describe('presenters e bilhete não validado', () => {
  it('expõe prazo, bilhete não validado e valor a estornar', () => {
    const presented = presentPurchase(
      order({
        status: 'paid',
        paidAt: '2026-09-23T10:05:00.000Z',
        totalInCents: 2000,
        items: [notValidated, valid],
      }),
    )
    expect(presented.refundDueInCents).toBe(1000)
    expect(presented.items[0]).toMatchObject({
      validationStatus: 'not_validated',
      salesEndAt: '2026-09-23T10:00:00.000Z',
    })
    expect(presented.items[0]).not.toHaveProperty('identification')
    expect(presented.items[1]).toMatchObject({ identification: 'X-2' })
    expect(presented.message).toMatch(/não validados/)
  })

  it('pedido não validado não traz dados pessoais', () => {
    const presented = presentPurchase(
      order({
        status: 'not_validated',
        items: [{ ...ticket('card-001'), validationStatus: 'not_validated' }],
      }),
    )
    expect(presented).not.toHaveProperty('customer')
    expect(presented.refundDueInCents).toBe(1000)
    expect(presented.message).toMatch(/estornado/)
  })

  it('pedido sem bilhete atrasado não traz valor a estornar', () => {
    const presented = presentPurchase(order({ status: 'paid', items: [valid] }))
    expect(presented).not.toHaveProperty('refundDueInCents')
  })

  it('visão do painel marca o bilhete e informa o estorno', () => {
    const presented = presentAdminOrder(order({ status: 'paid', items: [notValidated, valid] }))
    expect(presented.refundDueInCents).toBe(1000)
    expect(presented.items[0]).toMatchObject({ validationStatus: 'not_validated' })
    expect(presented.items[1]).not.toHaveProperty('validationStatus')
  })
})
