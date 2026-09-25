const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Fortaleza',
})

export function formatDate(date: string) {
  return dateFormatter.format(new Date(date))
}

const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  timeZone: 'America/Fortaleza',
})

export function formatWeekday(date: string) {
  return weekdayFormatter.format(new Date(date))
}
