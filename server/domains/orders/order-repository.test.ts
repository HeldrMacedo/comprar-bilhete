import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type AppDatabase } from '../../shared/database.js'
import { OrderRepository } from './order-repository.js'
import { order, ticket } from './order-test-fixtures.js'

let database: AppDatabase
const now = () => new Date('2026-09-23T10:05:00.000Z')

afterEach(() => database.close())

function setup() {
  database = createDatabase(':memory:')
  const repository = new OrderRepository(database, now)
  const created = repository.createManual(
    order({ items: [ticket('card-001'), ticket('card-002')], totalInCents: 2000 }),
  )
  return { repository, created }
}

describe('OrderRepository e prazo de vendas', () => {
  it('guarda o menor horário de recebimento', () => {
    const { repository, created } = setup()
    expect(repository.recordPaymentReceivedAt(created.id, '2026-09-23T10:03:00.000Z')).toBe(
      '2026-09-23T10:03:00.000Z',
    )
    expect(repository.recordPaymentReceivedAt(created.id, '2026-09-23T10:04:00.000Z')).toBe(
      '2026-09-23T10:03:00.000Z',
    )
    expect(repository.recordPaymentReceivedAt(created.id, '2026-09-23T10:01:00.000Z')).toBe(
      '2026-09-23T10:01:00.000Z',
    )
    expect(repository.get(created.id)?.paymentReceivedAt).toBe('2026-09-23T10:01:00.000Z')
  })

  it('acha a hora de chegada do webhook pelo NSU', () => {
    const { repository, created } = setup()
    repository.enqueuePaymentEvent({
      invoice_slug: 'slug-1',
      amount: 2000,
      paid_amount: 2000,
      installments: 1,
      capture_method: 'pix',
      transaction_nsu: 'nsu-1',
      order_nsu: created.id,
      receipt_url: 'https://example.com/r',
      items: [],
    })
    expect(repository.findPaymentEventReceivedAt('nsu-1', 'slug-1')).toBe(now().toISOString())
    expect(repository.findPaymentEventReceivedAt('nsu-x', 'slug-1')).toBeNull()
    expect(repository.firstPaymentEventAt(created.id)).toBe(now().toISOString())
  })

  it('marca bilhetes não validados e libera a reserva local deles', () => {
    const { repository, created } = setup()
    repository.markItemsNotValidated(created.id, ['sorteio-setembro:card-001'])
    const updated = repository.get(created.id)
    expect(updated?.items.map((item) => item.validationStatus)).toEqual([
      'not_validated',
      undefined,
    ])
    expect(repository.isReserved('sorteio-setembro:card-001')).toBe(false)
    expect(repository.isReserved('sorteio-setembro:card-002')).toBe(true)
  })

  it('marca o pedido como não validado', () => {
    const { repository, created } = setup()
    repository.markNotValidated(created.id)
    const updated = repository.get(created.id)
    expect(updated).toMatchObject({ status: 'not_validated', paidAt: now().toISOString() })
    expect(repository.isReserved('sorteio-setembro:card-002')).toBe(false)
  })

  it('não atribui posição de lote a bilhete não validado', () => {
    const { repository, created } = setup()
    repository.markItemsNotValidated(created.id, ['sorteio-setembro:card-001'])
    repository.assignBatchPositions(created.id)
    const [late, valid] = repository.get(created.id)?.items ?? []
    expect(late?.validationBatch).toBe('mock')
    expect(valid).toMatchObject({ validationBatch: '84734', batchPosition: 1 })
  })
})
