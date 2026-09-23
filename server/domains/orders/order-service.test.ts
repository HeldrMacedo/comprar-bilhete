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
  TICKET_ESTABLISHMENT_ID: '4734',
  TICKET_REGIONAL_ID: '57',
  INFINITEPAY_API_BASE_URL: 'https://api.checkout.infinitepay.io',
}

const apps: Awaited<ReturnType<typeof buildApp>>[] = []
const existingCustomer = {
  name: 'Maria da Silva',
  cpf: '52998224725',
  phone: '84999855367',
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('pedido e pagamento', () => {
  it('reserva os identificadores exatos da selecao manual', async () => {
    const app = await buildApp({ env, logger: false, startWorker: false })
    apps.push(app)

    const response = await createOrder(app, {
      mode: 'manual',
      cardIds: ['card-001'],
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      selectionMode: 'manual',
      unitPriceInCents: 1000,
      totalInCents: 1000,
      items: [{ id: 'card-001', code: '#001' }],
    })
  })

  it('aloca no backend a quantidade solicitada na surpresinha', async () => {
    const app = await buildApp({ env, logger: false, startWorker: false })
    apps.push(app)

    const response = await createOrder(app, { mode: 'random', quantity: 3 })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      selectionMode: 'random',
      unitPriceInCents: 1000,
      totalInCents: 3000,
    })
    expect(response.json<{ items: unknown[] }>().items).toHaveLength(3)
  })

  it.each([0, 51, 1.5])('rejeita quantidade aleatoria invalida: %s', async (quantity) => {
    const app = await buildApp({ env, logger: false, startWorker: false })
    apps.push(app)

    const response = await createOrder(app, { mode: 'random', quantity })

    expect(response.statusCode).toBe(400)
  })

  it('permite somente uma reserva manual concorrente da mesma cartela', async () => {
    const app = await buildApp({ env, logger: false, startWorker: false })
    apps.push(app)

    const responses = await Promise.all([
      createOrder(app, { mode: 'manual', cardIds: ['card-010'] }),
      createOrder(app, { mode: 'manual', cardIds: ['card-010'] }),
    ])

    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409])
    expect(responses.find(({ statusCode }) => statusCode === 409)?.json()).toMatchObject({
      code: 'TICKET_RESERVED',
    })
  })

  it('resolve o cliente novamente e exige endereco para novo cadastro', async () => {
    const app = await buildApp({ env, logger: false, startWorker: false })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: {
        raffleId: 'sorteio-setembro',
        selection: { mode: 'manual', cardIds: ['card-001'] },
        customer: { name: 'Cliente Novo', cpf: '11144477735', phone: '84999998888' },
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'ADDRESS_REQUIRED' })
  })

  it('reserva, cria checkout, reconcilia e entrega a cartela', async () => {
    const app = await buildApp({ env, logger: false, startWorker: false })
    apps.push(app)

    const created = await createOrder(app, { mode: 'manual', cardIds: ['card-001'] })
    expect(created.statusCode).toBe(201)
    const order = created.json<{ id: string; totalInCents: number }>()
    expect(order.totalInCents).toBe(1000)

    const conflict = await createOrder(app, { mode: 'manual', cardIds: ['card-001'] })
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

  it('aceita o webhook rapidamente e processa a confirmacao de forma assincrona', async () => {
    const app = await buildApp({ env, logger: false, startWorker: false })
    apps.push(app)
    const created = await createOrder(app, { mode: 'manual', cardIds: ['card-002'] })
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

function createOrder(
  app: Awaited<ReturnType<typeof buildApp>>,
  selection: { mode: 'manual'; cardIds: string[] } | { mode: 'random'; quantity: number },
) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    payload: { raffleId: 'sorteio-setembro', selection, customer: existingCustomer },
  })
}
