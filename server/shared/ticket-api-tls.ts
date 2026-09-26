import { DomainError } from './errors.js'

export function hasTicketApiTls(baseUrl: string, allowHttp = false): boolean {
  return allowHttp || new URL(baseUrl).protocol === 'https:'
}

export function requireTicketApiTls(baseUrl: string, allowHttp = false): void {
  if (hasTicketApiTls(baseUrl, allowHttp)) return
  throw new DomainError(
    'A compra está indisponível até a API de bilhetes oferecer HTTPS.',
    503,
    'TICKET_API_TLS_REQUIRED',
  )
}
