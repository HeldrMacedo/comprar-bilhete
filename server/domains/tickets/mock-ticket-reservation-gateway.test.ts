import { describe, expect, it } from 'vitest'
import { MockTicketReservationGateway } from './mock-ticket-reservation-gateway.js'

const ttlMs = 30 * 60_000
const key = { raffleId: '2026041', ticketNumber: '000123' }

describe('MockTicketReservationGateway', () => {
  it('concede a reserva a somente um de dois pedidos simultâneos', async () => {
    const gateway = new MockTicketReservationGateway(ttlMs)

    const results = await Promise.all([gateway.reserve(key), gateway.reserve(key)])

    expect(results.map(({ status }) => status).sort()).toEqual(['conflict', 'reserved'])
  })

  it('libera somente com o token de quem reservou', async () => {
    const gateway = new MockTicketReservationGateway(ttlMs)
    const result = await gateway.reserve(key)
    if (result.status !== 'reserved') throw new Error('Reserva esperada.')

    expect(await gateway.release(key, 'outro-token')).toBe('not_owner')
    expect(await gateway.release(key, result.token)).toBe('released')
    expect(await gateway.inspect(key)).toEqual({ reserved: false, token: null, validated: false })
  })

  it('permite nova reserva depois do prazo', async () => {
    let now = new Date('2026-09-27T10:00:00.000Z')
    const gateway = new MockTicketReservationGateway(ttlMs, () => now)
    await gateway.reserve(key)

    now = new Date('2026-09-27T10:31:00.000Z')

    expect((await gateway.reserve(key)).status).toBe('reserved')
  })
})
