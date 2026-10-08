import { expect, it } from 'vitest'
import type { ContestValues } from '../domain/types'
import {
  contestFormSchema,
  fromContestForm,
  parsePriceToCents,
  sensitiveChanges,
  toContestForm,
} from './contest-form'

const values: ContestValues = {
  salesStartAt: '2026-10-01T08:00',
  salesEndAt: '2026-10-14T19:00',
  drawDate: '2026-10-14',
  drawTime: '20:00',
  priceInCents: 250,
  prizes: ['MOTO 0KM', 'R$ 2 MIL'],
  luckySpinsCount: 0,
  luckySpinsLabel: '',
  doubleChance: true,
}

it('converts prices to integer cents without floating point', () => {
  expect(parsePriceToCents('2,5')).toBe(250)
  expect(parsePriceToCents('10')).toBe(1000)
  expect(parsePriceToCents('0,10')).toBe(10)
  expect(parsePriceToCents('1.234,00')).toBeNull()
  expect(parsePriceToCents('abc')).toBeNull()
})

it('round-trips the form and drops empty prize slots', () => {
  const form = toContestForm(values)
  expect(form.prizes).toHaveLength(5)
  expect(form.price).toBe('2,50')
  expect(fromContestForm(contestFormSchema.parse(form))).toEqual(values)
})

it('validates date order and spins label', () => {
  const form = toContestForm(values)
  const result = contestFormSchema.safeParse({
    ...form,
    salesEndAt: '2026-10-14T21:00',
    luckySpinsCount: '5',
  })
  expect(result.success).toBe(false)
  expect(result.error?.issues.map((issue) => issue.message)).toEqual([
    'As vendas precisam terminar até o horário do sorteio.',
    'Informe o valor dos giros.',
  ])
})

it('lists only price and date changes as sensitive', () => {
  const format = (cents: number) => `R$ ${cents}`
  expect(sensitiveChanges(values, { ...values, prizes: ['OUTRO'] }, format)).toEqual([])
  expect(
    sensitiveChanges(values, { ...values, priceInCents: 300, drawTime: '21:00' }, format),
  ).toEqual([
    { label: 'Valor do bilhete', before: 'R$ 250', after: 'R$ 300' },
    { label: 'Data do sorteio', before: '14/10/2026 20:00', after: '14/10/2026 21:00' },
  ])
})
