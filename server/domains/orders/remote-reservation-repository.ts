import { z } from 'zod'
import type { AppDatabase } from '../../shared/database.js'
import type { TicketReservationKey } from '../tickets/ticket-reservation-gateway.js'

export type HeldReservation = {
  orderId: string
  key: TicketReservationKey
  token: string
}

const heldRowsSchema = z.array(
  z
    .object({
      order_id: z.string(),
      raffle_id: z.string(),
      ticket_number: z.string(),
      token: z.string(),
    })
    .transform((row): HeldReservation => ({
      orderId: row.order_id,
      key: { raffleId: row.raffle_id, ticketNumber: row.ticket_number },
      token: row.token,
    })),
)

// Reserva de bilhete marcado como não validado no próprio pedido.
const NOT_VALIDATED_TICKET = `EXISTS (
  SELECT 1 FROM json_each(o.items_json) AS item
  WHERE json_extract(item.value, '$.id') = r.ticket_number
    AND COALESCE(json_extract(item.value, '$.raffleId'), o.raffle_id) = r.raffle_id
    AND json_extract(item.value, '$.validationStatus') = 'not_validated'
)`

// held: trava remota ativa; released/lost: trava liberada ou tomada por outro canal;
// validated: bilhete validado após pagamento confirmado.
export class RemoteReservationRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly now: () => Date,
  ) {}

  recordHeld(orderId: string, key: TicketReservationKey, token: string) {
    this.database
      .prepare(
        `
        INSERT INTO remote_reservations (
          order_id, raffle_id, ticket_number, token, status, updated_at
        ) VALUES (?, ?, ?, ?, 'held', ?)
      `,
      )
      .run(orderId, key.raffleId, key.ticketNumber, token, this.now().toISOString())
  }

  listHeld(orderId: string) {
    return heldRowsSchema.parse(
      this.database
        .prepare(
          `
          SELECT order_id, raffle_id, ticket_number, token FROM remote_reservations
          WHERE order_id = ? AND status = 'held' ORDER BY raffle_id, ticket_number
        `,
        )
        .all(orderId),
    )
  }

  hasAny(orderId: string) {
    return (
      this.database
        .prepare('SELECT 1 FROM remote_reservations WHERE order_id = ? LIMIT 1')
        .get(orderId) !== undefined
    )
  }

  listAbandoned(limit: number) {
    return heldRowsSchema.parse(
      this.database
        .prepare(
          `
          SELECT r.order_id, r.raffle_id, r.ticket_number, r.token
          FROM remote_reservations r JOIN orders o ON o.id = r.order_id
          WHERE r.status = 'held'
            AND (o.status IN ('expired', 'cancelled', 'not_validated') OR ${NOT_VALIDATED_TICKET})
          ORDER BY r.updated_at LIMIT ?
        `,
        )
        .all(limit),
    )
  }

  mark(reservation: HeldReservation, status: 'released' | 'lost') {
    this.database
      .prepare(
        `
        UPDATE remote_reservations SET status = ?, last_error = NULL, updated_at = ?
        WHERE order_id = ? AND raffle_id = ? AND ticket_number = ? AND status = 'held'
      `,
      )
      .run(
        status,
        this.now().toISOString(),
        reservation.orderId,
        reservation.key.raffleId,
        reservation.key.ticketNumber,
      )
  }

  markReleaseFailed(reservation: HeldReservation, message: string) {
    this.database
      .prepare(
        `
        UPDATE remote_reservations SET last_error = ?, updated_at = ?
        WHERE order_id = ? AND raffle_id = ? AND ticket_number = ?
      `,
      )
      .run(
        message.slice(0, 500),
        this.now().toISOString(),
        reservation.orderId,
        reservation.key.raffleId,
        reservation.key.ticketNumber,
      )
  }

  markOrderValidated(orderId: string) {
    this.database
      .prepare(
        `
        UPDATE remote_reservations AS r SET status = 'validated', updated_at = ?
        WHERE r.order_id = ? AND r.status = 'held'
          AND NOT EXISTS (
            SELECT 1 FROM orders AS o WHERE o.id = r.order_id AND ${NOT_VALIDATED_TICKET}
          )
      `,
      )
      .run(this.now().toISOString(), orderId)
  }
}
