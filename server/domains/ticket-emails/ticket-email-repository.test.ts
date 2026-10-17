import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../../shared/database.js'
import { OrderRepository } from '../orders/order-repository.js'
import { existingMaria, order } from '../orders/order-test-fixtures.js'
import { TicketEmailRepository } from './ticket-email-repository.js'

let current = new Date('2026-10-17T12:00:00.000Z')
const now = () => current
const databases: Array<ReturnType<typeof createDatabase>> = []

afterEach(() => {
  databases.splice(0).forEach((database) => database.close())
  current = new Date('2026-10-17T12:00:00.000Z')
})

function setup(email: string | null = 'maria@example.com') {
  const database = createDatabase(':memory:')
  databases.push(database)
  const orders = new OrderRepository(database, now)
  const paid = order({
    customer: { ...existingMaria, ...(email ? { email } : {}) },
    expiresAt: '2026-10-17T13:00:00.000Z',
  })
  orders.create(paid)
  return { orders, emails: new TicketEmailRepository(database, now), orderId: paid.id }
}

describe('TicketEmailRepository', () => {
  it('markPaid enfileira um único e-mail por pedido', () => {
    const { orders, emails, orderId } = setup()
    orders.markPaid(orderId)
    orders.markPaid(orderId)
    expect(emails.get(orderId)).toMatchObject({ status: 'pending', attempts: 0 })
    expect(emails.claimNext()).toEqual({ orderId, attempts: 0 })
    expect(emails.claimNext()).toBeNull()
  })

  it('pedido sem e-mail nasce sem destinatário e nunca é reservado', () => {
    const { orders, emails, orderId } = setup(null)
    orders.markPaid(orderId)
    expect(emails.get(orderId)).toMatchObject({ status: 'no_recipient' })
    expect(emails.claimNext()).toBeNull()
  })

  it('reserva por 10 minutos: item preso volta para a fila depois disso', () => {
    const { orders, emails, orderId } = setup()
    orders.markPaid(orderId)
    expect(emails.claimNext()).not.toBeNull()
    current = new Date('2026-10-17T12:09:59.000Z')
    expect(emails.claimNext()).toBeNull()
    current = new Date('2026-10-17T12:10:00.000Z')
    expect(emails.claimNext()).toEqual({ orderId, attempts: 0 })
  })

  it('registra tentativa falha, falha definitiva, envio e reenvio', () => {
    const { orders, emails, orderId } = setup()
    orders.markPaid(orderId)
    emails.claimNext()
    emails.markFailedAttempt(orderId, 1, new Date('2026-10-17T12:01:00.000Z'), 'code=EAUTH')
    expect(emails.get(orderId)).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError: 'code=EAUTH',
    })
    expect(emails.claimNext()).toBeNull()
    current = new Date('2026-10-17T12:01:00.000Z')
    expect(emails.claimNext()).toEqual({ orderId, attempts: 1 })

    emails.markFailedAttempt(orderId, 5, null, 'code=ETIMEDOUT')
    expect(emails.get(orderId)).toMatchObject({ status: 'failed', attempts: 5 })

    emails.requeue(orderId)
    expect(emails.get(orderId)).toMatchObject({ status: 'pending', attempts: 0 })
    emails.claimNext()
    emails.markSent(orderId)
    expect(emails.get(orderId)).toMatchObject({
      status: 'sent',
      sentAt: current.toISOString(),
    })
    expect(emails.getStatuses([orderId, 'outro'])).toEqual(new Map([[orderId, 'sent']]))
  })

  it('requeue cria o registro de pedido pago antes da fila existir', () => {
    const { emails, orderId } = setup()
    emails.requeue(orderId)
    expect(emails.get(orderId)).toMatchObject({ status: 'pending', attempts: 0 })
  })

  it('requeue de e-mail já enviado limpa a data de envio', () => {
    const { orders, emails, orderId } = setup()
    orders.markPaid(orderId)
    emails.claimNext()
    emails.markSent(orderId)
    emails.requeue(orderId)
    expect(emails.get(orderId)).toMatchObject({ status: 'pending' })
    expect(emails.get(orderId)?.sentAt).toBeFalsy()
  })
})
