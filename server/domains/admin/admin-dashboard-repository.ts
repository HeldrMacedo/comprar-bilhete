import { z } from 'zod'
import type { AppDatabase } from '../../shared/database.js'
import { orderStatusSchema } from '../orders/order-types.js'

// Dias do painel seguem o fuso dos sorteios (America/Fortaleza, UTC-3 sem horário de verão).
const LOCAL_DAY = (column: string) => `date(${column}, '-3 hours')`

const totalsSchema = z.object({
  customers: z.number(),
  paid_orders: z.number(),
  paid_tickets: z.number(),
  revenue_in_cents: z.number(),
  pending_orders: z.number(),
  pending_tickets: z.number(),
  manual_review_orders: z.number(),
})

const dailySchema = z.object({ day: z.string(), revenue_in_cents: z.number(), tickets: z.number() })
const statusSchema = z.object({ status: orderStatusSchema, orders: z.number() })
const raffleSchema = z.object({
  raffle_id: z.string(),
  raffle_title: z.string(),
  tickets: z.number(),
  revenue_in_cents: z.number(),
})

export class AdminDashboardRepository {
  constructor(private readonly database: AppDatabase) {}

  totals() {
    const row = this.database
      .prepare(
        `SELECT
          COUNT(DISTINCT json_extract(customer_json, '$.cpf')) AS customers,
          COALESCE(SUM(status = 'paid'), 0) AS paid_orders,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN json_array_length(items_json) END), 0)
            AS paid_tickets,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN total_in_cents END), 0) AS revenue_in_cents,
          COALESCE(SUM(status = 'pending'), 0) AS pending_orders,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN json_array_length(items_json) END), 0)
            AS pending_tickets,
          COALESCE(SUM(status = 'manual_review'), 0) AS manual_review_orders
        FROM orders`,
      )
      .get()
    return totalsSchema.parse(row)
  }

  // Receita pela data de confirmação do pagamento; dias sem venda não aparecem.
  dailyPaid(fromDay: string) {
    return this.database
      .prepare(
        `SELECT ${LOCAL_DAY('paid_at')} AS day,
          SUM(total_in_cents) AS revenue_in_cents,
          SUM(json_array_length(items_json)) AS tickets
        FROM orders
        WHERE status = 'paid' AND paid_at IS NOT NULL AND ${LOCAL_DAY('paid_at')} >= ?
        GROUP BY day
        ORDER BY day`,
      )
      .all(fromDay)
      .map((row) => dailySchema.parse(row))
  }

  ordersByStatus() {
    return this.database
      .prepare('SELECT status, COUNT(*) AS orders FROM orders GROUP BY status')
      .all()
      .map((row) => statusSchema.parse(row))
  }

  // Pedido com dois sorteios: cada bilhete conta no próprio concurso.
  paidByRaffle() {
    return this.database
      .prepare(
        `SELECT
          raffle_key AS raffle_id,
          MAX(raffle_name) AS raffle_title,
          COUNT(*) AS tickets,
          SUM(price) AS revenue_in_cents
        FROM (
          SELECT
            COALESCE(json_extract(item.value, '$.raffleId'), orders.raffle_id) AS raffle_key,
            COALESCE(json_extract(item.value, '$.raffleTitle'), orders.raffle_title) AS raffle_name,
            COALESCE(
              json_extract(item.value, '$.unitPriceInCents'),
              orders.unit_price_in_cents
            ) AS price
          FROM orders, json_each(orders.items_json) AS item
          WHERE orders.status = 'paid'
        )
        GROUP BY raffle_key
        ORDER BY tickets DESC, raffle_key`,
      )
      .all()
      .map((row) => raffleSchema.parse(row))
  }
}
