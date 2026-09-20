const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Fortaleza',
})

export function formatDate(date: string) {
  return dateFormatter.format(new Date(date))
}
