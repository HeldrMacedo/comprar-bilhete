import { describe, expect, it } from 'vitest'
import type { Order } from '../domain/types'
import { earliestSalesEnd } from './sales-deadline'

function item(salesEndAt?: string): NonNullable<Order['items']>[number] {
  return {
    id: 'card-001',
    code: '#001',
    numbers: [1, 2, 3],
    raffleId: 'r',
    raffleTitle: 'Sorteio',
    unitPriceInCents: 1000,
    salesEndAt,
  }
}

describe('earliestSalesEnd', () => {
  it('retorna o menor fim de vendas', () => {
    expect(
      earliestSalesEnd([item('2026-10-04T20:00:00.000Z'), item('2026-09-30T20:00:00.000Z')]),
    ).toBe('2026-09-30T20:00:00.000Z')
  })

  it('ignora itens sem salesEndAt', () => {
    expect(earliestSalesEnd([item(), item('2026-09-30T20:00:00.000Z')])).toBe(
      '2026-09-30T20:00:00.000Z',
    )
  })

  it('retorna undefined quando nenhum item tem prazo', () => {
    expect(earliestSalesEnd([item()])).toBeUndefined()
    expect(earliestSalesEnd(undefined)).toBeUndefined()
  })
})
