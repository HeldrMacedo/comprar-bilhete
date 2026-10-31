import { describe, expect, it } from 'vitest'
import { order, ticket } from './order-test-fixtures.js'
import {
  lateTicketKeys,
  pendingRefundInCents,
  refundDueInCents,
  ticketKey,
  validatedItems,
} from './sales-deadline.js'

const deadline = '2026-09-27T22:00:00.000Z'

describe('prazo de vendas', () => {
  it('marca como atrasado o bilhete pago no fim das vendas ou depois', () => {
    const late = order({ items: [{ ...ticket('card-001'), salesEndAt: deadline }] })
    expect(lateTicketKeys(late, '2026-09-27T21:59:59.999Z')).toEqual([])
    expect(lateTicketKeys(late, deadline)).toEqual(['sorteio-setembro:card-001'])
    expect(lateTicketKeys(late, '2026-09-28T10:00:00.000Z')).toEqual(['sorteio-setembro:card-001'])
  })

  it('não checa bilhete sem fim de vendas', () => {
    expect(lateTicketKeys(order(), '2030-01-01T00:00:00.000Z')).toEqual([])
  })

  it('separa por concurso em pedido agrupado', () => {
    const grouped = order({
      items: [
        { ...ticket('card-001'), raffleId: 'cap', salesEndAt: deadline, unitPriceInCents: 1000 },
        {
          ...ticket('card-001'),
          raffleId: 'esp',
          salesEndAt: '2026-10-01T22:00:00.000Z',
          unitPriceInCents: 600,
        },
      ],
      totalInCents: 1600,
    })
    expect(lateTicketKeys(grouped, '2026-09-28T00:00:00.000Z')).toEqual(['cap:card-001'])
  })

  it('soma o valor a estornar e filtra os validados', () => {
    const partial = order({
      items: [
        { ...ticket('card-001'), validationStatus: 'not_validated', unitPriceInCents: 1000 },
        { ...ticket('card-002'), unitPriceInCents: 1000 },
      ],
      totalInCents: 2000,
    })
    expect(refundDueInCents(partial)).toBe(1000)
    expect(validatedItems(partial).map((item) => item.id)).toEqual(['card-002'])
    expect(ticketKey(partial, ticket('card-002'))).toBe('sorteio-setembro:card-002')
  })

  it('só considera estorno pendente em pedido pago ou não validado', () => {
    const items = [{ ...ticket('card-001'), validationStatus: 'not_validated' as const }]
    expect(pendingRefundInCents(order({ status: 'paid', items }))).toBe(1000)
    expect(pendingRefundInCents(order({ status: 'not_validated', items }))).toBe(1000)
    expect(pendingRefundInCents(order({ status: 'manual_review', items }))).toBe(0)
    expect(pendingRefundInCents(order({ status: 'cancelled', items }))).toBe(0)
  })
})
