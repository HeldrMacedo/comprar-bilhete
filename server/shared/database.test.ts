import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { OrderRepository } from '../domains/orders/order-repository.js'
import {
  existingMaria,
  order,
  orderDraft,
  ticket,
} from '../domains/orders/order-test-fixtures.js'
import { paymentEventSchema } from '../domains/orders/order-types.js'
import { createDatabase } from './database.js'

const temporaryDirectories: string[] = []
const reservationTime = () => new Date('2026-09-23T10:00:00.000Z')

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('database migrations', () => {
  it('creates an empty database at schema version 3', () => {
    const database = createDatabase(':memory:')

    expect(database.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 3 })
    expect(database.prepare('PRAGMA table_info(orders)').all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'selection_mode' }),
        expect.objectContaining({ name: 'unit_price_in_cents' }),
        expect.objectContaining({ name: 'paid_amount_in_cents' }),
        expect.objectContaining({ name: 'capture_method' }),
      ]),
    )
    database.close()
  })

  it('upgrades an unversioned existing database without losing orders', () => {
    const directory = mkdtempSync(join(tmpdir(), 'comprar-bilhete-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'legacy.db')
    const legacy = new DatabaseSync(path)
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        raffle_id TEXT NOT NULL,
        raffle_title TEXT NOT NULL,
        status TEXT NOT NULL,
        total_in_cents INTEGER NOT NULL,
        customer_json TEXT NOT NULL,
        items_json TEXT NOT NULL,
        checkout_url TEXT,
        receipt_url TEXT,
        transaction_nsu TEXT,
        invoice_slug TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        paid_at TEXT
      );
      CREATE TABLE reservations (
        ticket_key TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
      );
      CREATE TABLE payment_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        processed_at TEXT
      );
    `)
    legacy
      .prepare(`
        INSERT INTO orders (
          id, raffle_id, raffle_title, status, total_in_cents, customer_json,
          items_json, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        '00000000-0000-4000-8000-000000000001',
        'sorteio-setembro',
        'Sorteio de Setembro',
        'pending',
        1000,
        JSON.stringify(existingMaria),
        JSON.stringify([ticket('card-001')]),
        '2026-09-23T10:00:00.000Z',
        '2026-09-23T10:15:00.000Z',
      )
    legacy.close()

    const upgraded = createDatabase(path)

    expect(upgraded.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 3 })
    expect(upgraded.prepare('SELECT * FROM orders').get()).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      selection_mode: 'manual',
      unit_price_in_cents: 1000,
    })
    upgraded.close()
  })
})

describe('OrderRepository reservations', () => {
  it('rejects a duplicate manual reservation without creating a second order', () => {
    const database = createDatabase(':memory:')
    const repository = new OrderRepository(database, reservationTime)
    repository.createManual(order())

    expect(() =>
      repository.createManual(
        order({ id: '00000000-0000-4000-8000-000000000002' }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'TICKET_RESERVED' }))
    expect(database.prepare('SELECT COUNT(*) AS count FROM orders').get()).toMatchObject({ count: 1 })
    database.close()
  })

  it('assigns distinct tickets across random reservations', () => {
    const database = createDatabase(':memory:')
    const repository = new OrderRepository(database, reservationTime)
    const candidates = [ticket('card-001'), ticket('card-002'), ticket('card-003'), ticket('card-004')]

    const first = repository.createRandom(orderDraft('first'), candidates, 2)
    const second = repository.createRandom(orderDraft('second'), candidates, 2)

    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(4)
    database.close()
  })

  it('rolls back a random order when quantity cannot be completed', () => {
    const database = createDatabase(':memory:')
    const repository = new OrderRepository(database, reservationTime)
    const draft = orderDraft('first')

    expect(() => repository.createRandom(draft, [ticket('card-001')], 2)).toThrowError(
      expect.objectContaining({ code: 'INSUFFICIENT_TICKETS' }),
    )
    expect(repository.get(draft.id)).toBeNull()
    database.close()
  })

  it('expires pending reservations but preserves manual review reservations', () => {
    let currentTime = new Date('2026-09-23T10:00:00.000Z')
    const database = createDatabase(':memory:')
    const repository = new OrderRepository(database, () => currentTime)
    repository.createManual(
      order({ id: '00000000-0000-4000-8000-000000000001', expiresAt: '2026-09-23T10:05:00.000Z' }),
    )
    repository.createManual(
      order({
        id: '00000000-0000-4000-8000-000000000002',
        items: [ticket('card-002')],
        expiresAt: '2026-09-23T10:05:00.000Z',
      }),
    )
    repository.markManualReview(
      '00000000-0000-4000-8000-000000000002',
      'Pagamento exige análise.',
    )

    currentTime = new Date('2026-09-23T10:06:00.000Z')
    expect(repository.get('00000000-0000-4000-8000-000000000001')?.status).toBe('expired')
    expect(database.prepare('SELECT order_id FROM reservations').all()).toEqual([
      { order_id: '00000000-0000-4000-8000-000000000002' },
    ])
    database.close()
  })
})

describe('OrderRepository payment evidence', () => {
  const paidEvent = paymentEventSchema.parse({
    invoice_slug: 'invoice-001',
    amount: 1000,
    paid_amount: 1000,
    installments: 1,
    capture_method: 'pix',
    transaction_nsu: 'transaction-001',
    order_nsu: '00000000-0000-4000-8000-000000000001',
    receipt_url: 'https://example.com/receipt',
    items: [],
  })

  it('deduplicates payment events by transaction and invoice', () => {
    const database = createDatabase(':memory:')
    const repository = new OrderRepository(database, reservationTime)
    repository.createManual(order())

    expect(repository.enqueuePaymentEvent(paidEvent)).toBe('created')
    expect(repository.enqueuePaymentEvent(paidEvent)).toBe('duplicate')
    expect(database.prepare('SELECT COUNT(*) AS count FROM payment_events').get()).toMatchObject({
      count: 1,
    })
    database.close()
  })

  it('stores verified payment evidence independently from paid status', () => {
    const database = createDatabase(':memory:')
    const repository = new OrderRepository(database, reservationTime)
    repository.createManual(order())

    repository.recordPaymentEvidence(paidEvent)

    expect(database.prepare('SELECT * FROM orders WHERE id = ?').get(paidEvent.order_nsu)).toMatchObject({
      status: 'pending',
      transaction_nsu: 'transaction-001',
      invoice_slug: 'invoice-001',
      paid_amount_in_cents: 1000,
      capture_method: 'pix',
    })
    database.close()
  })
})
