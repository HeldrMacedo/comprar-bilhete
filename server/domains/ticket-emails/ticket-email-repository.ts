import { z } from 'zod'
import type { AppDatabase } from '../../shared/database.js'

export const ticketEmailStatusSchema = z.enum(['pending', 'sent', 'failed', 'no_recipient'])
export type TicketEmailStatus = z.infer<typeof ticketEmailStatusSchema>

const CLAIM_LEASE_MS = 10 * 60_000

const rowSchema = z.object({
  status: ticketEmailStatusSchema,
  attempts: z.number().int(),
  last_error: z.string().nullable(),
  sent_at: z.string().nullable(),
})

export class TicketEmailRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // Reserva o próximo envio vencido empurrando next_attempt_at: se o processo cair no meio do
  // envio, o item volta sozinho para a fila depois da reserva.
  claimNext(): { orderId: string; attempts: number } | null {
    const now = this.now()
    const row = this.database
      .prepare(
        `UPDATE order_emails SET next_attempt_at = ?, updated_at = ?
         WHERE order_id = (
           SELECT order_id FROM order_emails
           WHERE status = 'pending' AND next_attempt_at <= ?
           ORDER BY next_attempt_at LIMIT 1
         )
         RETURNING order_id, attempts`,
      )
      .get(
        new Date(now.getTime() + CLAIM_LEASE_MS).toISOString(),
        now.toISOString(),
        now.toISOString(),
      ) as { order_id: string; attempts: number } | undefined
    return row ? { orderId: row.order_id, attempts: row.attempts } : null
  }

  markSent(orderId: string) {
    const now = this.now().toISOString()
    this.database
      .prepare(
        "UPDATE order_emails SET status = 'sent', sent_at = ?, last_error = NULL, updated_at = ? WHERE order_id = ?",
      )
      .run(now, now, orderId)
  }

  markNoRecipient(orderId: string) {
    this.database
      .prepare("UPDATE order_emails SET status = 'no_recipient', updated_at = ? WHERE order_id = ?")
      .run(this.now().toISOString(), orderId)
  }

  // nextAttemptAt null encerra as tentativas.
  markFailedAttempt(orderId: string, attempts: number, nextAttemptAt: Date | null, error: string) {
    const now = this.now().toISOString()
    this.database
      .prepare(
        `UPDATE order_emails
         SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
         WHERE order_id = ?`,
      )
      .run(
        nextAttemptAt ? 'pending' : 'failed',
        attempts,
        (nextAttemptAt ?? this.now()).toISOString(),
        error.slice(0, 500),
        now,
        orderId,
      )
  }

  get(orderId: string) {
    const row = this.database
      .prepare('SELECT status, attempts, last_error, sent_at FROM order_emails WHERE order_id = ?')
      .get(orderId)
    if (!row) return null
    const parsed = rowSchema.parse(row)
    return {
      status: parsed.status,
      attempts: parsed.attempts,
      ...(parsed.last_error ? { lastError: parsed.last_error } : {}),
      ...(parsed.sent_at ? { sentAt: parsed.sent_at } : {}),
    }
  }

  // Volta para a fila com tentativas zeradas; cria o registro de pedido pago antes da fila.
  requeue(orderId: string) {
    const now = this.now().toISOString()
    this.database
      .prepare(
        `INSERT INTO order_emails (order_id, status, attempts, next_attempt_at, created_at, updated_at)
         VALUES (?, 'pending', 0, ?, ?, ?)
         ON CONFLICT(order_id) DO UPDATE SET
           status = 'pending', attempts = 0, next_attempt_at = excluded.next_attempt_at,
           last_error = NULL, sent_at = NULL, updated_at = excluded.updated_at`,
      )
      .run(orderId, now, now, now)
  }

  getStatuses(orderIds: string[]) {
    const statuses = new Map<string, TicketEmailStatus>()
    if (orderIds.length === 0) return statuses
    const rows = this.database
      .prepare(
        `SELECT order_id, status FROM order_emails WHERE order_id IN (${orderIds.map(() => '?').join(', ')})`,
      )
      .all(...orderIds) as Array<{ order_id: string; status: string }>
    for (const row of rows) statuses.set(row.order_id, ticketEmailStatusSchema.parse(row.status))
    return statuses
  }
}
