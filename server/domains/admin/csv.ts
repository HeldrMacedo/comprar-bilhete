// CSV para Excel em português: separador ";", BOM UTF-8 e CRLF.
const BOM = '﻿'

export type CsvValue = string | number | null | undefined

function escapeCell(value: CsvValue) {
  if (value === null || value === undefined) return ''
  let text = String(value)
  // Evita injeção de fórmula ao abrir no Excel.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(header: string[], rows: Iterable<CsvValue[]>) {
  const lines = [header.map(escapeCell).join(';')]
  for (const row of rows) lines.push(row.map(escapeCell).join(';'))
  return `${BOM}${lines.join('\r\n')}\r\n`
}

export function formatCentsForCsv(cents: number | undefined) {
  if (cents === undefined) return ''
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  return `${sign}${Math.trunc(absolute / 100)},${String(absolute % 100).padStart(2, '0')}`
}

const csvDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Fortaleza',
})

export function formatDateForCsv(iso: string | undefined) {
  return iso ? csvDateFormatter.format(new Date(iso)).replace(',', '') : ''
}
