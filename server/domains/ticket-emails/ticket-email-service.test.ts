import { afterEach, describe, expect, it, vi } from 'vitest'
import { MailDeliveryError } from '../accounts/mail-gateway.js'
import { MockMailGateway } from '../accounts/mock-mail-gateway.js'
import { createDatabase } from '../../shared/database.js'
import { OrderRepository } from '../orders/order-repository.js'
import { existingMaria, order } from '../orders/order-test-fixtures.js'
import { TicketEmailRepository } from './ticket-email-repository.js'
import { TicketEmailService } from './ticket-email-service.js'

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
  const repository = new TicketEmailRepository(database, now)
  const mail = new MockMailGateway()
  const service = new TicketEmailService(repository, orders, mail, 'http://localhost:5173', now)
  const created = order({
    customer: { ...existingMaria, ...(email ? { email } : {}) },
    expiresAt: '2026-10-17T13:00:00.000Z',
  })
  orders.create(created)
  return { orders, repository, mail, service, orderId: created.id }
}

describe('TicketEmailService', () => {
  it('envia o e-mail com a cartela e o PDF e marca como enviado', async () => {
    const { orders, repository, mail, service, orderId } = setup()
    orders.markPaid(orderId)

    expect(await service.processNext()).toBe(true)
    expect(await service.processNext()).toBe(false)
    expect(mail.messages).toHaveLength(1)
    expect(mail.messages[0]).toMatchObject({
      to: 'maria@example.com',
      subject: 'Seus bilhetes Sol da Sorte — pagamento confirmado',
      attachments: [
        { filename: `bilhetes-${orderId.slice(0, 8)}.pdf`, contentType: 'application/pdf' },
      ],
    })
    expect(mail.messages[0]!.attachments![0]!.content.subarray(0, 5).toString()).toBe('%PDF-')
    expect(repository.get(orderId)).toMatchObject({ status: 'sent' })
  })

  it('tenta de novo em 1, 5, 30 e 120 minutos e desiste na 5ª falha', async () => {
    const { orders, repository, mail, service, orderId } = setup()
    vi.spyOn(mail, 'send').mockRejectedValue(new MailDeliveryError({ code: 'ECONNECTION' }))
    orders.markPaid(orderId)

    const delays = [1, 5, 30, 120]
    for (const [index, minutes] of delays.entries()) {
      expect(await service.processNext()).toBe(true)
      expect(repository.get(orderId)).toMatchObject({
        status: 'pending',
        attempts: index + 1,
        lastError: 'code=ECONNECTION',
      })
      current = new Date(current.getTime() + minutes * 60_000 - 1)
      expect(await service.processNext()).toBe(false)
      current = new Date(current.getTime() + 1)
    }
    expect(await service.processNext()).toBe(true)
    expect(repository.get(orderId)).toMatchObject({ status: 'failed', attempts: 5 })
  })

  it('erro que não é de envio não grava dados pessoais em lastError', async () => {
    const { orders, repository, mail, service, orderId } = setup()
    vi.spyOn(mail, 'send').mockRejectedValue(new Error('falhou para maria@example.com'))
    orders.markPaid(orderId)

    expect(await service.processNext()).toBe(true)
    const lastError = repository.get(orderId)?.lastError
    expect(lastError).not.toContain('maria@example.com')
    expect(lastError).toBe('falha ao montar ou enviar o e-mail (Error)')
  })

  it('processPending esvazia a fila até o limite por rodada', async () => {
    const { orders, mail, service, orderId } = setup()
    const second = order({
      id: '00000000-0000-4000-8000-000000000002',
      customer: { ...existingMaria, email: 'maria@example.com' },
      items: [{ ...order().items[0]!, id: 'card-002', code: 'card-002' }],
      expiresAt: '2026-10-17T13:00:00.000Z',
    })
    orders.create(second)
    orders.markPaid(orderId)
    orders.markPaid(second.id)

    expect(await service.processPending(1)).toBe(1)
    expect(await service.processPending()).toBe(1)
    expect(await service.processPending()).toBe(0)
    expect(mail.messages).toHaveLength(2)
  })

  it('pedido sem e-mail não envia nada', async () => {
    const { orders, mail, service, orderId } = setup(null)
    orders.markPaid(orderId)
    expect(await service.processNext()).toBe(false)
    expect(mail.messages).toHaveLength(0)
  })

  it('reenvio aceita pedido pago enviado, falho ou sem registro e recusa os demais', () => {
    const { orders, repository, service, orderId } = setup()
    expect(() => service.resend(orderId)).toThrow(
      expect.objectContaining({ code: 'ORDER_NOT_PAID', statusCode: 409 }),
    )

    orders.markPaid(orderId)
    expect(() => service.resend(orderId)).toThrow(
      expect.objectContaining({ code: 'EMAIL_ALREADY_QUEUED', statusCode: 409 }),
    )

    repository.claimNext()
    repository.markSent(orderId)
    service.resend(orderId)
    expect(repository.get(orderId)).toMatchObject({ status: 'pending', attempts: 0 })
    expect(service.statusesOf([orderId])).toEqual(new Map([[orderId, 'pending']]))
    expect(() => service.resend('00000000-0000-4000-8000-00000000ffff')).toThrow(
      expect.objectContaining({ statusCode: 404 }),
    )
  })

  it('reenvio recusa pedido sem e-mail', () => {
    const { orders, service, orderId } = setup(null)
    orders.markPaid(orderId)
    expect(() => service.resend(orderId)).toThrow(
      expect.objectContaining({ code: 'EMAIL_NO_RECIPIENT', statusCode: 409 }),
    )
  })
})
