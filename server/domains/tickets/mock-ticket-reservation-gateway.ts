import type {
  ReleaseResult,
  ReservationSnapshot,
  ReserveResult,
  TicketReservationGateway,
  TicketReservationKey,
} from './ticket-reservation-gateway.js'

type Lease = { token: string; reservedAt: number }

export class MockTicketReservationGateway implements TicketReservationGateway {
  private readonly leases = new Map<string, Lease>()
  private sequence = 0

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reserve(key: TicketReservationKey): Promise<ReserveResult> {
    const id = leaseId(key)
    const now = this.now().getTime()
    const current = this.leases.get(id)
    if (current && now - current.reservedAt < this.ttlMs) return { status: 'conflict' }
    this.sequence += 1
    const token = `${new Date(now).toISOString()}#${this.sequence}`
    this.leases.set(id, { token, reservedAt: now })
    return { status: 'reserved', token }
  }

  async release(key: TicketReservationKey, token: string): Promise<ReleaseResult> {
    const id = leaseId(key)
    if (this.leases.get(id)?.token !== token) return 'not_owner'
    this.leases.delete(id)
    return 'released'
  }

  async inspect(key: TicketReservationKey): Promise<ReservationSnapshot> {
    const lease = this.leases.get(leaseId(key))
    const active = lease !== undefined && this.now().getTime() - lease.reservedAt < this.ttlMs
    return { reserved: active, token: active ? lease.token : null, validated: false }
  }

  reserveFromAnotherChannel(key: TicketReservationKey) {
    this.leases.set(leaseId(key), { token: 'outro-canal', reservedAt: this.now().getTime() })
  }
}

function leaseId(key: TicketReservationKey) {
  return `${key.raffleId}:${key.ticketNumber}`
}
