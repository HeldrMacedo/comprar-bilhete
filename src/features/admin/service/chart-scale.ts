// Teto "redondo" para o eixo: 1, 2 ou 5 × 10^n, sempre acima do maior valor.
export function niceMax(value: number) {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10
  return step * magnitude
}

export function shortDay(day: string) {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`
}

const compactCurrency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatCompactCurrency(cents: number) {
  return compactCurrency.format(cents / 100)
}
