import type {
  TicketReservationGateway,
  TicketReservationKey,
} from '../tickets/ticket-reservation-gateway.js'
import type { Order } from './order-types.js'
import type {
  HeldReservation,
  RemoteReservationRepository,
} from './remote-reservation-repository.js'

export class TicketReservationCoordinator {
  constructor(
    private readonly gateway: TicketReservationGateway,
    private readonly store: RemoteReservationRepository,
  ) {}

  async acquire(order: Order): Promise<'acquired' | 'conflict'> {
    for (const key of reservationKeys(order)) {
      const result = await this.gateway.reserve(key).catch(async (error: unknown) => {
        await this.releaseOrder(order.id)
        throw error
      })
      if (result.status === 'conflict') {
        await this.releaseOrder(order.id)
        return 'conflict'
      }
      this.store.recordHeld(order.id, key, result.token)
    }
    return 'acquired'
  }

  async confirmOwnership(order: Order) {
    const held = this.store.listHeld(order.id)
    // Pedido criado antes da reserva externa: segue o fluxo anterior.
    if (held.length === 0 && !this.store.hasAny(order.id)) return true
    if (held.length !== order.items.length) return false
    for (const reservation of held) {
      const snapshot = await this.gateway.inspect(reservation.key)
      if (!snapshot?.reserved || snapshot.validated || snapshot.token !== reservation.token) {
        return false
      }
    }
    return true
  }

  markValidated(orderId: string) {
    this.store.markOrderValidated(orderId)
  }

  async releaseOrder(orderId: string) {
    for (const reservation of this.store.listHeld(orderId)) await this.release(reservation)
  }

  async releaseAbandoned(limit = 20) {
    const abandoned = this.store.listAbandoned(limit)
    for (const reservation of abandoned) await this.release(reservation)
    return abandoned.length
  }

  // Falha mantém a trava como held para o worker tentar de novo; o prazo externo
  // libera o bilhete mesmo que todas as tentativas falhem.
  private async release(reservation: HeldReservation) {
    try {
      const result = await this.gateway.release(reservation.key, reservation.token)
      this.store.mark(reservation, result === 'released' ? 'released' : 'lost')
    } catch (error) {
      this.store.markReleaseFailed(
        reservation,
        error instanceof Error ? error.message : 'Falha ao liberar reserva externa.',
      )
    }
  }
}

function reservationKeys(order: Order): TicketReservationKey[] {
  return order.items
    .map((item) => ({ raffleId: item.raffleId ?? order.raffleId, ticketNumber: item.id }))
    .sort(
      (left, right) =>
        left.raffleId.localeCompare(right.raffleId) ||
        left.ticketNumber.localeCompare(right.ticketNumber),
    )
}
