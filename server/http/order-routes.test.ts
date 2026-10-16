import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { parseServerEnv } from '../config/env.js'
import { loginAsMaria } from './test-session.js'

const env = parseServerEnv({
  DATABASE_PATH: ':memory:',
  TICKET_PROVIDER: 'mock',
  PAYMENT_PROVIDER: 'mock',
})

const apps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

async function createApp() {
  const app = await buildApp({ env, logger: false, startWorker: false })
  apps.push(app)
  return app
}

type App = Awaited<ReturnType<typeof createApp>>

async function createOrder(app: App, cookies: Record<string, string>, cardId: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    cookies,
    payload: {
      raffleId: 'sorteio-setembro',
      selection: { mode: 'manual', cardIds: [cardId] },
      beneficiaryName: 'João Terceiro',
    },
  })
  expect(response.statusCode, response.body).toBe(201)
  return response.json<{ id: string }>().id
}

function listMine(app: App, cookies: Record<string, string>) {
  return app.inject({ method: 'GET', url: '/api/v1/orders/mine', cookies })
}

describe('pedido pela sessão do cliente', () => {
  it('exige sessão para criar pedido', async () => {
    const app = await createApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: {
        raffleId: 'sorteio-setembro',
        selection: { mode: 'manual', cardIds: ['card-001'] },
      },
    })
    expect(response.statusCode).toBe(401)
  })

  it('usa o comprador da sessão e ignora customer enviado pelo navegador', async () => {
    const app = await createApp()
    const cookies = await loginAsMaria(app)
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      cookies,
      payload: {
        raffleId: 'sorteio-setembro',
        selection: { mode: 'manual', cardIds: ['card-001'] },
        beneficiaryName: 'João Terceiro',
        customer: { name: 'Intruso', cpf: '11144477735', phone: '84999990000' },
      },
    })
    expect(created.statusCode).toBe(201)
    const mine = await app.inject({ method: 'GET', url: '/api/v1/orders/mine', cookies })
    expect(mine.json<{ orders: Array<{ id: string }> }>().orders.map((order) => order.id)).toEqual([
      created.json<{ id: string }>().id,
    ])
  })

  it('recusa criar pedido vindo de outra origem', async () => {
    const app = await createApp()
    const cookies = await loginAsMaria(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      cookies,
      headers: { origin: 'https://malicioso.example' },
      payload: {
        raffleId: 'sorteio-setembro',
        selection: { mode: 'manual', cardIds: ['card-001'] },
      },
    })
    expect(response.statusCode).toBe(403)
  })

  it('Minhas compras exige sessão', async () => {
    const app = await createApp()
    expect((await app.inject({ method: 'GET', url: '/api/v1/orders/mine' })).statusCode).toBe(401)
  })

  it('rotas de consulta por CPF não existem mais', async () => {
    const app = await createApp()
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/orders/lookup',
          payload: { cpf: '52998224725' },
        })
      ).statusCode,
    ).toBe(404)
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/customers/lookup?cpf=52998224725' }))
        .statusCode,
    ).toBe(404)
  })
})

describe('Minhas compras', () => {
  it('lista pedidos pagos com dezenas, dados do comprovante e dados do cliente', async () => {
    const app = await createApp()
    const cookies = await loginAsMaria(app)
    const id = await createOrder(app, cookies, 'card-001')
    await app.inject({ method: 'POST', url: `/api/v1/orders/${id}/checkout` })
    await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${id}?transaction_nsu=mock-${id}&slug=mock-${id}`,
    })

    const response = await listMine(app, cookies)

    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    const body = response.json<{ orders: Array<Record<string, unknown>> }>()
    expect(body.orders).toHaveLength(1)
    expect(body.orders[0]).toMatchObject({
      id,
      status: 'paid',
      totalInCents: 1000,
      paymentMethod: 'pix',
      customer: { name: 'João Terceiro', phone: '84999855367', cpf: '52998224725' },
      items: [
        {
          id: 'card-001',
          numbers: expect.any(Array),
          secondChanceNumbers: expect.arrayContaining([expect.any(Number)]),
          identification: expect.any(String),
          drawDate: '2026-09-30T21:00:00.000Z',
          prizes: expect.arrayContaining(['1 AVELLOZ AZ1']),
          luckySpins: { count: 10, label: 'R$ 300,00' },
          validationBatch: '84734',
          batchPosition: expect.any(Number),
        },
      ],
    })
    expect(body.orders[0]).toHaveProperty('paidAt')
    expect(body.orders[0]).not.toHaveProperty('checkoutUrl')
    expect(response.body).not.toContain('Maria da Silva')
  })

  it('não devolve dados pessoais de pedido que não foi pago', async () => {
    const app = await createApp()
    const cookies = await loginAsMaria(app)
    await createOrder(app, cookies, 'card-003')

    const response = await listMine(app, cookies)

    const order = response.json<{ orders: Array<Record<string, unknown>> }>().orders[0]
    expect(order).toMatchObject({ status: 'pending' })
    expect(order).not.toHaveProperty('customer')
    expect(order?.items).toEqual([
      expect.not.objectContaining({ batchPosition: expect.anything() }),
    ])
    for (const personal of ['Maria da Silva', '84999855367', 'João Terceiro', '52998224725']) {
      expect(response.body).not.toContain(personal)
    }
  })

  it('mostra o link de pagamento apenas de pedido pendente', async () => {
    const app = await createApp()
    const cookies = await loginAsMaria(app)
    const id = await createOrder(app, cookies, 'card-002')
    await app.inject({ method: 'POST', url: `/api/v1/orders/${id}/checkout` })

    const response = await listMine(app, cookies)

    expect(response.json()).toMatchObject({
      orders: [{ id, status: 'pending', checkoutUrl: expect.stringContaining(id) }],
    })
  })

  it('devolve lista vazia para quem ainda não comprou', async () => {
    const app = await createApp()
    const cookies = await loginAsMaria(app)

    const response = await listMine(app, cookies)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ orders: [] })
  })
})
