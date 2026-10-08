import { expect, it } from 'vitest'
import { formatCentsForCsv, toCsv } from './csv.js'

it('escapes separators, quotes and spreadsheet formulas', () => {
  const csv = toCsv(
    ['Nome', 'Obs'],
    [
      ['=HYPERLINK("x")', 'a;b'],
      ['Ana "Bia"', null],
    ],
  )

  expect(csv).toBe('﻿Nome;Obs\r\n"\'=HYPERLINK(""x"")";"a;b"\r\n"Ana ""Bia""";\r\n')
})

it('formats cents with a decimal comma without floating point', () => {
  expect(formatCentsForCsv(123456)).toBe('1234,56')
  expect(formatCentsForCsv(5)).toBe('0,05')
  expect(formatCentsForCsv(undefined)).toBe('')
})
