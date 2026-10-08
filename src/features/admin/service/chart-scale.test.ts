import { expect, it } from 'vitest'
import { niceMax, shortDay } from './chart-scale'

it('rounds the axis maximum up to 1, 2 or 5 times a power of ten', () => {
  expect(niceMax(0)).toBe(1)
  expect(niceMax(7)).toBe(10)
  expect(niceMax(160_000)).toBe(200_000)
  expect(niceMax(500)).toBe(500)
  expect(niceMax(501)).toBe(1000)
})

it('formats ISO days as dd/mm without time zone conversion', () => {
  expect(shortDay('2026-10-01')).toBe('01/10')
})
