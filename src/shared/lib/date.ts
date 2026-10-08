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

const drawDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Fortaleza',
})

export function formatDrawDate(date: string) {
  return drawDateFormatter.format(new Date(date))
}

export function formatDateTime(date: string) {
  return drawDateFormatter.format(new Date(date))
}
