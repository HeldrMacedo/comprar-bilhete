import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.js'
import type { ServerEnv } from '../../config/env.js'

const env: ServerEnv = {
  SERVER_PORT: 3333,
  DATABASE_PATH: ':memory:',
  PUBLIC_APP_URL: 'http://localhost:5173',
  PUBLIC_API_URL: 'http://localhost:3333',
  ORDER_EXPIRATION_MINUTES: 15,
  TICKET_PROVIDER: 'mock',
  PAYMENT_PROVIDER: 'mock',
  TICKET_API_BASE_URL: 'http://66.94.99.64:9090',
  INFINITEPAY_API_BASE_URL: 'https://api.checkout.infinitepay.io',
}

const apps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('pedido e pagamento', () => {
  it('reserva, cria checkout, reconcilia e entrega a cartela', async () => {
    const app = await buildApp({ env, logger: false, startWorker: false })
    apps.push(app)

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: {
        raffleId: 'sorteio-setembro',
        cardIds: ['card-001'],
        customer: { name: 'Maria da Silva', cpf: '52998224725', phone: '+5585999998888' },
      },
    })
    expect(created.statusCode).toBe(201)
    const order = created.json<{ id: string; totalInCents: number }>()
    expect(order.totalInCents).toBe(1000)

    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: {
        raffleId: 'sorteio-setembro',
        cardIds: ['card-001'],
        customer: { name: 'João da Silva', cpf: '52998224725', phone: '+5585999998888' },
      },
    })
    expect(conflict.statusCode).toBe(409)

    const checkout = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${order.id}/checkout`,
    })
    expect(checkout.statusCode).toBe(200)

    const paid = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${order.id}?transaction_nsu=mock-${order.id}&slug=mock-${order.id}`,
    })
    expect(paid.json<{ status: string }>().status).toBe('paid')
  })

  it('aceita o webhook rapidamente e processa a confirmação de forma assíncrona', async () => {
    const app = await buildApp({ env, logger: false, startWorker: false })
    apps.push(app)
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: {
        raffleId: 'sorteio-setembro',
        cardIds: ['card-002'],
        customer: { name: 'Maria da Silva', cpf: '52998224725', phone: '+5585999998888' },
      },
    })
    const order = created.json<{ id: string }>()
    await app.inject({ method: 'POST', url: `/api/v1/orders/${order.id}/checkout` })

    const webhook = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/infinitepay',
      payload: {
        invoice_slug: `mock-${order.id}`,
        amount: 1000,
        paid_amount: 1000,
        installments: 1,
        capture_method: 'pix',
        transaction_nsu: `mock-${order.id}`,
        order_nsu: order.id,
        receipt_url: 'https://example.com/comprovante',
        items: [],
      },
    })
    expect(webhook.statusCode).toBe(200)

    await vi.waitFor(async () => {
      const response = await app.inject({ method: 'GET', url: `/api/v1/orders/${order.id}` })
      expect(response.json<{ status: string }>().status).toBe('paid')
    })
  })
})
