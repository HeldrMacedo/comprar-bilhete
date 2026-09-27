export type TicketReservationKey = {
  raffleId: string
  ticketNumber: string
}

export type ReserveResult = { status: 'reserved'; token: string } | { status: 'conflict' }

export type ReleaseResult = 'released' | 'not_owner'

export type ReservationSnapshot = {
  reserved: boolean
  token: string | null
  validated: boolean
}

// Trava remota na coluna bilhete.reservado. `token` identifica quem reservou
// (hoje, o valor de data_reservado) e é exigido para liberar.
export interface TicketReservationGateway {
  reserve(key: TicketReservationKey): Promise<ReserveResult>
  release(key: TicketReservationKey, token: string): Promise<ReleaseResult>
  inspect(key: TicketReservationKey): Promise<ReservationSnapshot | null>
}
