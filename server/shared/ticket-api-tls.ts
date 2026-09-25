import { DomainError } from './errors.js'

export function hasTicketApiTls(baseUrl: string): boolean {
  return new URL(baseUrl).protocol === 'https:'
}

export function requireTicketApiTls(baseUrl: string): void {
  if (hasTicketApiTls(baseUrl)) return
  throw new DomainError(
    'A compra está indisponível até a API de bilhetes oferecer HTTPS.',
    503,
    'TICKET_API_TLS_REQUIRED',
  )
}
