const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function formatCurrency(valueInCents: number) {
  return currencyFormatter.format(valueInCents / 100)
}
