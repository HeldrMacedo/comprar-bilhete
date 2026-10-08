import type { CustomerFilters, OrderStatus, SalesFilters } from '../domain/types'

export const PAGE_SIZE = 20

const statuses: OrderStatus[] = [
  'pending',
  'processing',
  'paid',
  'expired',
  'cancelled',
  'manual_review',
]
const isoDate = /^\d{4}-\d{2}-\d{2}$/

function text(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim()
  return value ? value.slice(0, 80) : undefined
}

function date(params: URLSearchParams, key: string) {
  const value = params.get(key)
  return value && isoDate.test(value) ? value : undefined
}

export function readPage(params: URLSearchParams) {
  const page = Number(params.get('pagina'))
  return Number.isInteger(page) && page > 0 ? page : 1
}

// Filtros vivem na URL: recarregar ou voltar no navegador preserva a busca.
export function readSalesFilters(params: URLSearchParams): SalesFilters {
  const status = params.get('status')
  return {
    q: text(params, 'q'),
    status: statuses.find((candidate) => candidate === status),
    from: date(params, 'de'),
    to: date(params, 'ate'),
  }
}

export function readCustomerFilters(params: URLSearchParams): CustomerFilters {
  const purchase = params.get('compra')
  return {
    q: text(params, 'q'),
    purchase: purchase === 'paid' || purchase === 'unpaid' ? purchase : undefined,
    from: date(params, 'de'),
    to: date(params, 'ate'),
  }
}

export function toSearchParams(values: Record<string, string | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value?.trim()) params.set(key, value.trim())
  }
  return params
}
