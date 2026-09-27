import { describe, expect, it, vi } from 'vitest'
import { createDatabase } from '../../shared/database.js'
import { DomainError } from '../../shared/errors.js'
import { MockTicketReservationGateway } from '../tickets/mock-ticket-reservation-gateway.js'
import { OrderRepository } from './order-repository.js'
import { order, ticket } from './order-test-fixtures.js'
import { RemoteReservationRepository } from './remote-reservation-repository.js'
import { TicketReservationCoordinator } from './ticket-reservation-coordinator.js'

const now = () => new Date('2026-09-23T10:00:00.000Z')
const key = (ticketNumber: string) => ({ raffleId: 'sorteio-setembro', ticketNumber })

function setup() {
  const database = createDatabase(':memory:')
  const orders = new OrderRepository(database, now)
  const store = new RemoteReservationRepository(database, now)
  const gateway = new MockTicketReservationGateway(30 * 60_000, now)
  const coordinator = new TicketReservationCoordinator(gateway, store)
  const pending = order({ items: [ticket('card-002'), ticket('card-001')] })
  orders.createManual(pending)
  return { database, orders, store, gateway, coordinator, pending }
}

describe('TicketReservationCoordinator', () => {
  it('reserva remotamente todas as cartelas em ordem estável', async () => {
    const { database, store, coordinator, pending } = setup()

    expect(await coordinator.acquire(pending)).toBe('acquired')

    expect(store.listHeld(pending.id).map(({ key: held }) => held.ticketNumber)).toEqual([
      'card-001',
      'card-002',
    ])
    database.close()
  })

  it('desfaz a reserva parcial quando outro canal já reservou uma cartela', async () => {
    const { database, store, gateway, coordinator, pending } = setup()
    gateway.reserveFromAnotherChannel(key('card-002'))

    expect(await coordinator.acquire(pending)).toBe('conflict')

    expect(await gateway.inspect(key('card-001'))).toMatchObject({ reserved: false })
    expect(store.listHeld(pending.id)).toEqual([])
    database.close()
  })

  it('desfaz a reserva parcial e relança quando a API falha', async () => {
    const { database, store, gateway, coordinator, pending } = setup()
    const original = gateway.reserve.bind(gateway)
    vi.spyOn(gateway, 'reserve')
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(
        new DomainError('Serviço externo indisponível.', 502, 'UPSTREAM_ERROR'),
      )

    await expect(coordinator.acquire(pending)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' })

    expect(await gateway.inspect(key('card-001'))).toMatchObject({ reserved: false })
    expect(store.listHeld(pending.id)).toEqual([])
    database.close()
  })

  it('só confirma posse com o mesmo token em todas as cartelas', async () => {
    const { database, gateway, coordinator, pending } = setup()
    await coordinator.acquire(pending)
    expect(await coordinator.confirmOwnership(pending)).toBe(true)

    gateway.reserveFromAnotherChannel(key('card-002'))

    expect(await coordinator.confirmOwnership(pending)).toBe(false)
    database.close()
  })

  it('mantém o fluxo atual para pedido criado antes da reserva externa', async () => {
    const { database, coordinator, pending } = setup()

    expect(await coordinator.confirmOwnership(pending)).toBe(true)
    database.close()
  })

  it('libera reservas de pedido cancelado e registra falha para nova tentativa', async () => {
    const { database, orders, store, gateway, coordinator, pending } = setup()
    await coordinator.acquire(pending)
    orders.cancel(pending.id)
    vi.spyOn(gateway, 'release').mockRejectedValueOnce(new Error('timeout'))

    expect(await coordinator.releaseAbandoned()).toBe(2)

    expect(store.listAbandoned(10)).toHaveLength(1)
    expect(
      database
        .prepare('SELECT last_error FROM remote_reservations WHERE last_error IS NOT NULL')
        .get(),
    ).toEqual({ last_error: 'timeout' })
    await coordinator.releaseAbandoned()
    expect(store.listAbandoned(10)).toEqual([])
    database.close()
  })
})
