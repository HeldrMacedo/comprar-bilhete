import { z } from 'zod'
import type { AppDatabase } from '../../shared/database.js'
import { mapOrder, type OrderRow } from '../orders/order-repository.js'
import { orderStatusSchema } from '../orders/order-types.js'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.')

export const salesFiltersSchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    status: orderStatusSchema.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .strict()

export const customerFiltersSchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    purchase: z.enum(['paid', 'unpaid']).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .strict()

export type SalesFilters = z.infer<typeof salesFiltersSchema>
export type CustomerFilters = z.infer<typeof customerFiltersSchema>
export type Page = { page: number; pageSize: number }

const customerRowSchema = z.object({
  cpf: z.string(),
  customer_json: z.string(),
  order_count: z.number(),
  paid_order_count: z.number(),
  paid_total_in_cents: z.number(),
  ticket_count: z.number(),
  first_order_at: z.string(),
  last_order_at: z.string(),
})

const latestCustomerSchema = z.object({
  name: z.string(),
  phone: z.string(),
  address: z
    .object({
      zipCode: z.string(),
      street: z.string(),
      number: z.string(),
      complement: z.string().optional(),
      neighborhood: z.string(),
      city: z.string(),
      state: z.string(),
    })
    .optional(),
})

export type CustomerSummary = {
  cpf: string
  name: string
  phone: string
  address?: z.infer<typeof latestCustomerSchema>['address']
  orderCount: number
  paidOrderCount: number
  paidTotalInCents: number
  ticketCount: number
  firstOrderAt: string
  lastOrderAt: string
}

// Datas do filtro são dias no fuso dos sorteios (America/Fortaleza, sem horário de verão).
function dayStart(date: string) {
  return new Date(`${date}T00:00:00-03:00`).toISOString()
}

function nextDayStart(date: string) {
  return new Date(Date.parse(`${date}T00:00:00-03:00`) + 86_400_000).toISOString()
}

function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

type Where = { sql: string; params: Array<string | number> }

function dateRange(column: string, from?: string, to?: string): Where[] {
  const clauses: Where[] = []
  if (from) clauses.push({ sql: `${column} >= ?`, params: [dayStart(from)] })
  if (to) clauses.push({ sql: `${column} < ?`, params: [nextDayStart(to)] })
  return clauses
}

function customerTextSearch(q: string): Where {
  const digits = q.replace(/\D/g, '')
  const parts = [
    "json_extract(customer_json, '$.name') LIKE ? ESCAPE '\\'",
    "json_extract(customer_json, '$.beneficiaryName') LIKE ? ESCAPE '\\'",
  ]
  const params: Array<string | number> = [likePattern(q), likePattern(q)]
  if (digits.length >= 3) {
    parts.push("json_extract(customer_json, '$.phone') LIKE ? ESCAPE '\\'")
    parts.push("json_extract(customer_json, '$.cpf') LIKE ? ESCAPE '\\'")
    params.push(likePattern(digits), likePattern(digits))
  }
  return { sql: parts.join(' OR '), params }
}

function combine(clauses: Where[]) {
  if (clauses.length === 0) return { sql: '', params: [] as Array<string | number> }
  return {
    sql: `WHERE ${clauses.map((clause) => `(${clause.sql})`).join(' AND ')}`,
    params: clauses.flatMap((clause) => clause.params),
  }
}

export class AdminSalesRepository {
  constructor(private readonly database: AppDatabase) {}

  searchOrders(filters: SalesFilters, page: Page) {
    const where = this.salesWhere(filters)
    const total = this.database
      .prepare(`SELECT COUNT(*) AS total FROM orders ${where.sql}`)
      .get(...where.params) as { total: number }
    const rows = this.database
      .prepare(`SELECT * FROM orders ${where.sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...where.params, page.pageSize, (page.page - 1) * page.pageSize)
    return { orders: rows.map((row) => mapOrder(row as OrderRow)), total: total.total }
  }

  *iterateOrders(filters: SalesFilters) {
    const where = this.salesWhere(filters)
    const rows = this.database
      .prepare(`SELECT * FROM orders ${where.sql} ORDER BY created_at DESC`)
      .iterate(...where.params)
    for (const row of rows) yield mapOrder(row as OrderRow)
  }

  searchCustomers(filters: CustomerFilters, page?: Page) {
    const { sql, params } = this.customersQuery(filters)
    const total = this.database
      .prepare(`SELECT COUNT(*) AS total FROM (${sql})`)
      .get(...params) as {
      total: number
    }
    const paging = page ? ' LIMIT ? OFFSET ?' : ''
    const pagingParams = page ? [page.pageSize, (page.page - 1) * page.pageSize] : []
    const rows = this.database
      .prepare(`${sql} ORDER BY last_order_at DESC${paging}`)
      .all(...params, ...pagingParams)
    return { customers: rows.map((row) => toCustomerSummary(row)), total: total.total }
  }

  private salesWhere(filters: SalesFilters) {
    const clauses: Where[] = []
    if (filters.status) clauses.push({ sql: 'status = ?', params: [filters.status] })
    clauses.push(...dateRange('created_at', filters.from, filters.to))
    if (filters.q) {
      const text = customerTextSearch(filters.q)
      const pattern = likePattern(filters.q)
      clauses.push({
        sql: `${text.sql}
          OR id LIKE ? ESCAPE '\\'
          OR EXISTS (
            SELECT 1 FROM json_each(orders.items_json) AS item
            WHERE json_extract(item.value, '$.code') LIKE ? ESCAPE '\\'
              OR json_extract(item.value, '$.id') = ?
              OR json_extract(item.value, '$.identification') LIKE ? ESCAPE '\\'
          )`,
        params: [
          ...text.params,
          `${filters.q.replace(/[\\%_]/g, '')}%`,
          pattern,
          filters.q,
          pattern,
        ],
      })
    }
    return combine(clauses)
  }

  // Um cliente por CPF; nome, celular e endereço vêm do pedido mais recente.
  private customersQuery(filters: CustomerFilters) {
    // Filtros aplicados depois do agrupamento: totais contam todos os pedidos do CPF e a busca
    // usa os dados mais recentes.
    const having: Where[] = [...dateRange('last_order_at', filters.from, filters.to)]
    if (filters.q) having.push(customerTextSearch(filters.q))
    if (filters.purchase === 'paid') having.push({ sql: 'paid_order_count > 0', params: [] })
    if (filters.purchase === 'unpaid') having.push({ sql: 'paid_order_count = 0', params: [] })
    const outer = combine(having)
    return {
      sql: `
        SELECT * FROM (
          SELECT
            json_extract(customer_json, '$.cpf') AS cpf,
            (SELECT latest.customer_json FROM orders AS latest
              WHERE json_extract(latest.customer_json, '$.cpf') = json_extract(orders.customer_json, '$.cpf')
              ORDER BY latest.created_at DESC LIMIT 1) AS customer_json,
            COUNT(*) AS order_count,
            SUM(status = 'paid') AS paid_order_count,
            COALESCE(SUM(CASE WHEN status = 'paid' THEN total_in_cents END), 0) AS paid_total_in_cents,
            COALESCE(SUM(CASE WHEN status = 'paid' THEN json_array_length(items_json) END), 0)
              AS ticket_count,
            MIN(created_at) AS first_order_at,
            MAX(created_at) AS last_order_at
          FROM orders
          GROUP BY json_extract(customer_json, '$.cpf')
        ) ${outer.sql}`,
      params: outer.params,
    }
  }
}

function toCustomerSummary(row: unknown): CustomerSummary {
  const parsed = customerRowSchema.parse(row)
  const latest = latestCustomerSchema.parse(JSON.parse(parsed.customer_json))
  return {
    cpf: parsed.cpf,
    name: latest.name,
    phone: latest.phone,
    ...(latest.address ? { address: latest.address } : {}),
    orderCount: parsed.order_count,
    paidOrderCount: parsed.paid_order_count,
    paidTotalInCents: parsed.paid_total_in_cents,
    ticketCount: parsed.ticket_count,
    firstOrderAt: parsed.first_order_at,
    lastOrderAt: parsed.last_order_at,
  }
}
