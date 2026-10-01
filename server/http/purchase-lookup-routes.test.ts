import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { parseServerEnv } from '../config/env.js'
import { createRateLimiter } from './rate-limit.js'

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

function lookup(app: Awaited<ReturnType<typeof buildApp>>, cpf: string) {
  return app.inject({ method: 'POST', url: '/api/v1/orders/lookup', payload: { cpf } })
}

describe('consulta de compras por CPF', () => {
  it('lista pedidos pagos com dezenas, dados do comprovante e dados do cliente', async () => {
    const app = await createApp()
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: {
        raffleId: 'sorteio-setembro',
        selection: { mode: 'manual', cardIds: ['card-001'] },
        customer: {
          name: 'Maria da Silva',
          cpf: '52998224725',
          phone: '84999855367',
          beneficiaryName: 'João Terceiro',
        },
      },
    })
    const { id } = created.json<{ id: string }>()
    await app.inject({ method: 'POST', url: `/api/v1/orders/${id}/checkout` })
    await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${id}?transaction_nsu=mock-${id}&slug=mock-${id}`,
    })

    const response = await lookup(app, '52998224725')

    expect(response.statusCode).toBe(200)
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
    await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: {
        raffleId: 'sorteio-setembro',
        selection: { mode: 'manual', cardIds: ['card-003'] },
        customer: {
          name: 'Maria da Silva',
          cpf: '52998224725',
          phone: '84999855367',
          beneficiaryName: 'João Terceiro',
        },
      },
    })

    const response = await lookup(app, '52998224725')

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
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: {
        raffleId: 'sorteio-setembro',
        selection: { mode: 'manual', cardIds: ['card-002'] },
        customer: { name: 'Maria da Silva', cpf: '52998224725', phone: '84999855367' },
      },
    })
    const { id } = created.json<{ id: string }>()
    await app.inject({ method: 'POST', url: `/api/v1/orders/${id}/checkout` })

    const response = await lookup(app, '52998224725')

    expect(response.json()).toMatchObject({
      orders: [{ id, status: 'pending', checkoutUrl: expect.stringContaining(id) }],
    })
  })

  it('devolve lista vazia para CPF sem compras e recusa CPF malformado', async () => {
    const app = await createApp()

    await expect(lookup(app, '11144477735')).resolves.toMatchObject({ statusCode: 200 })
    expect((await lookup(app, '11144477735')).json()).toEqual({ orders: [] })
    expect((await lookup(app, '123')).statusCode).toBe(400)
  })

  it('limita consultas repetidas do mesmo IP', async () => {
    const app = await createApp()
    const statuses: number[] = []
    for (let attempt = 0; attempt < 11; attempt += 1) {
      statuses.push((await lookup(app, '11144477735')).statusCode)
    }

    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true)
    expect(statuses[10]).toBe(429)
  })
})

describe('createRateLimiter', () => {
  it('libera novas consultas após a janela', () => {
    let current = 0
    const consume = createRateLimiter(1, 1_000, () => current)

    consume('ip')
    expect(() => consume('ip')).toThrow(expect.objectContaining({ statusCode: 429 }))
    expect(() => consume('outro-ip')).not.toThrow()
    current = 1_000
    expect(() => consume('ip')).not.toThrow()
  })
})
