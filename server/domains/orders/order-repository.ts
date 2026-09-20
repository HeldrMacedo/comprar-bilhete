import type { AppDatabase } from '../../shared/database.js'
import { DomainError } from '../../shared/errors.js'
import { orderSchema, paymentEventSchema, type Order, type PaymentEvent } from './order-types.js'

type OrderRow = Record<string, unknown>

export class OrderRepository {
  constructor(private readonly database: AppDatabase) {}

  create(order: Order) {
    this.expirePending()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database
        .prepare(
          `
          INSERT INTO orders (
            id, raffle_id, raffle_title, status, total_in_cents, customer_json, items_json,
            created_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          order.id,
          order.raffleId,
          order.raffleTitle,
          order.status,
          order.totalInCents,
          JSON.stringify(order.customer),
          JSON.stringify(order.items),
          order.createdAt,
          order.expiresAt,
        )
      for (const item of order.items) {
        const key = `${order.raffleId}:${item.id}`
        this.database
          .prepare('INSERT INTO reservations (ticket_key, order_id, expires_at) VALUES (?, ?, ?)')
          .run(key, order.id, order.expiresAt)
      }
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      if (String(error).includes('UNIQUE constraint failed: reservations.ticket_key')) {
        throw new DomainError('Uma ou mais cartelas já estão reservadas.', 409, 'TICKET_RESERVED')
      }
      throw error
    }
    return order
  }

  get(orderId: string) {
    this.expirePending()
    const row = this.database.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
    return row ? mapOrder(row as OrderRow) : null
  }

  setCheckout(orderId: string, checkoutUrl: string) {
    this.database
      .prepare('UPDATE orders SET checkout_url = ? WHERE id = ?')
      .run(checkoutUrl, orderId)
  }

  markProcessing(orderId: string, event: PaymentEvent) {
    this.database
      .prepare(
        `
        UPDATE orders SET status = 'processing', receipt_url = ?, transaction_nsu = ?,
          invoice_slug = ?, last_error = NULL WHERE id = ?
      `,
      )
      .run(event.receipt_url, event.transaction_nsu, event.invoice_slug, orderId)
  }

  markPaid(orderId: string) {
    const paidAt = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database
        .prepare("UPDATE orders SET status = 'paid', paid_at = ?, last_error = NULL WHERE id = ?")
        .run(paidAt, orderId)
      this.database.prepare('DELETE FROM reservations WHERE order_id = ?').run(orderId)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  markManualReview(orderId: string, message: string) {
    this.database
      .prepare("UPDATE orders SET status = 'manual_review', last_error = ? WHERE id = ?")
      .run(message.slice(0, 500), orderId)
  }

  enqueuePaymentEvent(event: PaymentEvent) {
    this.database
      .prepare(
        `
        INSERT INTO payment_events (order_id, payload_json, created_at)
        VALUES (?, ?, ?)
      `,
      )
      .run(event.order_nsu, JSON.stringify(event), new Date().toISOString())
  }

  claimPaymentEvent(): { id: number; event: PaymentEvent } | null {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const row = this.database
        .prepare(
          "SELECT id, payload_json FROM payment_events WHERE status = 'pending' ORDER BY id LIMIT 1",
        )
        .get() as { id: number; payload_json: string } | undefined
      if (!row) {
        this.database.exec('COMMIT')
        return null
      }
      this.database
        .prepare(
          "UPDATE payment_events SET status = 'processing', attempts = attempts + 1 WHERE id = ?",
        )
        .run(row.id)
      this.database.exec('COMMIT')
      return { id: row.id, event: paymentEventSchema.parse(JSON.parse(row.payload_json)) }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  completePaymentEvent(eventId: number) {
    this.database
      .prepare("UPDATE payment_events SET status = 'done', processed_at = ? WHERE id = ?")
      .run(new Date().toISOString(), eventId)
  }

  failPaymentEvent(eventId: number, error: string) {
    this.database
      .prepare("UPDATE payment_events SET status = 'pending', last_error = ? WHERE id = ?")
      .run(error.slice(0, 500), eventId)
  }

  private expirePending() {
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database
        .prepare("UPDATE orders SET status = 'expired' WHERE status = 'pending' AND expires_at < ?")
        .run(now)
      this.database.prepare('DELETE FROM reservations WHERE expires_at < ?').run(now)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}

function mapOrder(row: OrderRow): Order {
  return orderSchema.parse({
    id: row.id,
    raffleId: row.raffle_id,
    raffleTitle: row.raffle_title,
    status: row.status,
    totalInCents: row.total_in_cents,
    customer: JSON.parse(String(row.customer_json)),
    items: JSON.parse(String(row.items_json)),
    checkoutUrl: row.checkout_url ?? undefined,
    receiptUrl: row.receipt_url ?? undefined,
    transactionNsu: row.transaction_nsu ?? undefined,
    invoiceSlug: row.invoice_slug ?? undefined,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    paidAt: row.paid_at ?? undefined,
  })
}
