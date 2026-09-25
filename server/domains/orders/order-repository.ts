import type { AppDatabase } from '../../shared/database.js'
import { DomainError } from '../../shared/errors.js'
import {
  orderSchema,
  paymentEventSchema,
  type Order,
  type OrderDraft,
  type PaymentEvent,
  type Ticket,
} from './order-types.js'

type OrderRow = Record<string, unknown>

export type PreparedOrderGroup = {
  raffleId: string
  raffleTitle: string
  unitPriceInCents: number
  mode: 'manual' | 'random'
  quantity: number
  tickets: Ticket[]
}

export class OrderRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  create(order: Order) {
    return this.createManual(order)
  }

  createManual(order: Order) {
    return this.withReservationTransaction(() => {
      this.expirePendingWithinTransaction(this.now().toISOString())
      this.insertOrderAndReservations(order)
      return order
    })
  }

  createRandom(draft: OrderDraft, candidates: Ticket[], quantity: number) {
    return this.withReservationTransaction(() => {
      this.expirePendingWithinTransaction(this.now().toISOString())
      const selected: Ticket[] = []
      const seen = new Set<string>()

      for (const candidate of candidates) {
        if (selected.length === quantity) break
        const ticketKey = `${draft.raffleId}:${candidate.id}`
        if (seen.has(ticketKey) || this.isReserved(ticketKey)) continue
        seen.add(ticketKey)
        selected.push(candidate)
      }

      if (selected.length !== quantity) {
        throw new DomainError(
          'Nao ha cartelas suficientes disponiveis.',
          409,
          'INSUFFICIENT_TICKETS',
        )
      }

      const order = orderSchema.parse({ ...draft, items: selected })
      this.insertOrderAndReservations(order)
      return order
    })
  }

  createGrouped(draft: OrderDraft, groups: PreparedOrderGroup[]) {
    return this.withReservationTransaction(() => {
      this.expirePendingWithinTransaction(this.now().toISOString())
      const reserved = new Set<string>()
      const items: Ticket[] = []

      for (const group of groups) {
        const selected: Ticket[] = []
        for (const ticket of group.tickets) {
          if (selected.length === group.quantity) break
          const key = `${group.raffleId}:${ticket.id}`
          if (reserved.has(key) || this.isReserved(key)) {
            if (group.mode === 'manual') {
              throw new DomainError('Uma ou mais cartelas ja estao reservadas.', 409, 'TICKET_RESERVED')
            }
            continue
          }
          reserved.add(key)
          selected.push(ticket)
        }

        if (selected.length !== group.quantity) {
          throw new DomainError(
            'Nao ha cartelas suficientes disponiveis.',
            409,
            'INSUFFICIENT_TICKETS',
          )
        }

        items.push(
          ...selected.map((ticket) => ({
            ...ticket,
            raffleId: group.raffleId,
            raffleTitle: group.raffleTitle,
            unitPriceInCents: group.unitPriceInCents,
          })),
        )
      }

      const totalInCents = items.reduce((sum, item) => sum + (item.unitPriceInCents ?? 0), 0)
      if (totalInCents !== draft.totalInCents) {
        throw new DomainError('Total do pedido inconsistente.', 500, 'INVALID_ORDER_TOTAL')
      }
      const order = orderSchema.parse({ ...draft, items })
      this.insertOrderAndReservations(order)
      return order
    })
  }

  get(orderId: string) {
    this.expirePending()
    const row = this.database.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
    return row ? mapOrder(row as OrderRow) : null
  }

  isReserved(ticketKey: string) {
    return (
      this.database.prepare('SELECT 1 FROM reservations WHERE ticket_key = ?').get(ticketKey) !==
      undefined
    )
  }

  setCheckout(orderId: string, checkoutUrl: string) {
    this.database
      .prepare('UPDATE orders SET checkout_url = ? WHERE id = ?')
      .run(checkoutUrl, orderId)
  }

  recordPaymentEvidence(event: PaymentEvent) {
    this.database
      .prepare(
        `
        UPDATE orders SET receipt_url = ?, transaction_nsu = ?, invoice_slug = ?,
          paid_amount_in_cents = ?, capture_method = ? WHERE id = ?
      `,
      )
      .run(
        event.receipt_url,
        event.transaction_nsu,
        event.invoice_slug,
        event.paid_amount,
        event.capture_method,
        event.order_nsu,
      )
  }

  tryStartProcessing(orderId: string, expectedReservationCount: number) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.expirePendingWithinTransaction(this.now().toISOString())
      const reservations = this.database
        .prepare('SELECT COUNT(*) AS count FROM reservations WHERE order_id = ?')
        .get(orderId) as { count: number }
      if (reservations.count !== expectedReservationCount) {
        this.database.exec('COMMIT')
        return false
      }
      const result = this.database
        .prepare("UPDATE orders SET status = 'processing' WHERE id = ? AND status = 'pending'")
        .run(orderId)
      this.database.exec('COMMIT')
      return result.changes === 1
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  markPaid(orderId: string) {
    this.database
      .prepare("UPDATE orders SET status = 'paid', paid_at = ?, last_error = NULL WHERE id = ?")
      .run(this.now().toISOString(), orderId)
  }

  markManualReview(orderId: string, message: string) {
    this.database
      .prepare("UPDATE orders SET status = 'manual_review', last_error = ? WHERE id = ?")
      .run(message.slice(0, 500), orderId)
  }

  enqueuePaymentEvent(event: PaymentEvent) {
    const result = this.database
      .prepare(
        `
        INSERT OR IGNORE INTO payment_events (
          order_id, transaction_nsu, invoice_slug, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(
        event.order_nsu,
        event.transaction_nsu,
        event.invoice_slug,
        JSON.stringify(event),
        this.now().toISOString(),
      )
    return result.changes === 1 ? 'created' : 'duplicate'
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
      .run(this.now().toISOString(), eventId)
  }

  failPaymentEvent(eventId: number, error: string) {
    this.database
      .prepare("UPDATE payment_events SET status = 'pending', last_error = ? WHERE id = ?")
      .run(error.slice(0, 500), eventId)
  }

  private insertOrderAndReservations(order: Order) {
    this.database
      .prepare(
        `
        INSERT INTO orders (
          id, raffle_id, raffle_title, selection_mode, status, unit_price_in_cents,
          total_in_cents, customer_json, items_json, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        order.id,
        order.raffleId,
        order.raffleTitle,
        order.selectionMode,
        order.status,
        order.unitPriceInCents,
        order.totalInCents,
        JSON.stringify(order.customer),
        JSON.stringify(order.items),
        order.createdAt,
        order.expiresAt,
      )

    for (const item of order.items) {
      const ticketKey = `${item.raffleId ?? order.raffleId}:${item.id}`
      this.database
        .prepare('INSERT INTO reservations (ticket_key, order_id, expires_at) VALUES (?, ?, ?)')
        .run(ticketKey, order.id, order.expiresAt)
    }
  }

  private withReservationTransaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.database.exec('COMMIT')
      return result
    } catch (error) {
      this.database.exec('ROLLBACK')
      if (String(error).includes('UNIQUE constraint failed: reservations.ticket_key')) {
        throw new DomainError(
          'Uma ou mais cartelas ja estao reservadas.',
          409,
          'TICKET_RESERVED',
        )
      }
      throw error
    }
  }

  private expirePending() {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.expirePendingWithinTransaction(this.now().toISOString())
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  private expirePendingWithinTransaction(now: string) {
    this.database
      .prepare("UPDATE orders SET status = 'expired' WHERE status = 'pending' AND expires_at < ?")
      .run(now)
    this.database
      .prepare(`
        DELETE FROM reservations
        WHERE order_id IN (SELECT id FROM orders WHERE status IN ('expired', 'cancelled'))
      `)
      .run()
  }
}

function mapOrder(row: OrderRow): Order {
  return orderSchema.parse({
    id: row.id,
    raffleId: row.raffle_id,
    raffleTitle: row.raffle_title,
    selectionMode: row.selection_mode,
    status: row.status,
    unitPriceInCents: row.unit_price_in_cents,
    totalInCents: row.total_in_cents,
    customer: JSON.parse(String(row.customer_json)),
    items: JSON.parse(String(row.items_json)),
    checkoutUrl: row.checkout_url ?? undefined,
    receiptUrl: row.receipt_url ?? undefined,
    transactionNsu: row.transaction_nsu ?? undefined,
    invoiceSlug: row.invoice_slug ?? undefined,
    paidAmountInCents: row.paid_amount_in_cents ?? undefined,
    captureMethod: row.capture_method ?? undefined,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    paidAt: row.paid_at ?? undefined,
  })
}
