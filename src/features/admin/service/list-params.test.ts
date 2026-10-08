import { expect, it } from 'vitest'
import { readCustomerFilters, readPage, readSalesFilters, toSearchParams } from './list-params'

it('reads only valid filters from the URL', () => {
  const params = new URLSearchParams('q= maria &status=paid&de=2026-10-01&ate=ontem&pagina=3')

  expect(readSalesFilters(params)).toEqual({
    q: 'maria',
    status: 'paid',
    from: '2026-10-01',
    to: undefined,
  })
  expect(readPage(params)).toBe(3)
  expect(readPage(new URLSearchParams('pagina=-1'))).toBe(1)
  expect(readSalesFilters(new URLSearchParams('status=hacked')).status).toBeUndefined()
  expect(readCustomerFilters(new URLSearchParams('compra=paid')).purchase).toBe('paid')
})

it('drops empty values when writing the URL', () => {
  expect(toSearchParams({ q: ' ', status: 'paid', de: undefined }).toString()).toBe('status=paid')
})
