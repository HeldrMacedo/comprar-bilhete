import type {
  ReleaseResult,
  ReservationSnapshot,
  ReserveResult,
  TicketReservationGateway,
} from './ticket-reservation-gateway.js'

const LOCAL_TOKEN = 'local'

// Usado enquanto a API de bilhetes não publica reserva: vale só a reserva local.
export class NoopTicketReservationGateway implements TicketReservationGateway {
  async reserve(): Promise<ReserveResult> {
    return { status: 'reserved', token: LOCAL_TOKEN }
  }

  async release(): Promise<ReleaseResult> {
    return 'released'
  }

  async inspect(): Promise<ReservationSnapshot> {
    return { reserved: true, token: LOCAL_TOKEN, validated: false }
  }
}
