import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { parseServerEnv } from '../config/env.js'
import { MockTicketGateway } from '../domains/tickets/mock-ticket-gateway.js'
import { ADMIN_SESSION_COOKIE } from './admin-routes.js'

const PASSWORD = 'senha-segura-123'
const ORIGIN = 'http://localhost:5173'
const apps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

async function setup(tickets = new MockTicketGateway()) {
  // 02:30 UTC ainda é o dia anterior em Fortaleza.
  const now = () => new Date('2026-09-25T02:30:00.000Z')
  const app = await buildApp({
    env: parseServerEnv({
      DATABASE_PATH: ':memory:',
      PUBLIC_APP_URL: ORIGIN,
      ADMIN_BOOTSTRAP_LOGIN: 'admin',
      ADMIN_BOOTSTRAP_PASSWORD: PASSWORD,
    }),
    tickets,
    logger: false,
    startWorker: false,
    now,
  })
  apps.push(app)
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/session',
    payload: { login: 'admin', password: PASSWORD },
  })
  const cookie = login.cookies.find(({ name }) => name === ADMIN_SESSION_COOKIE)
  const headers = { cookie: `${ADMIN_SESSION_COOKIE}=${cookie?.value}`, origin: ORIGIN }

  async function createOrder(cpf: string, raffles: Array<{ raffleId: string; cardIds: string[] }>) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: {
        raffles: raffles.map(({ raffleId, cardIds }) => ({
          raffleId,
          selection: { mode: 'manual', cardIds },
        })),
        customer: { name: 'Maria da Silva', cpf, phone: '84999855367' },
      },
    })
    expect(response.statusCode, response.body).toBe(201)
    return response.json<{ id: string }>().id
  }

  return { app, headers, createOrder }
}

type Summary = {
  totals: Record<string, number>
  dailySales: Array<{ day: string; revenueInCents: number; tickets: number }>
  ordersByStatus: Array<{ status: string; orders: number }>
  ticketsByRaffle: Array<{ raffleId: string; tickets: number; revenueInCents: number }>
  upcomingRaffles: Array<{ id: string; paidTickets: number }> | null
  upcomingRafflesError?: string
}

describe('admin dashboard', () => {
  it('summarizes paid, pending and per-raffle sales', async () => {
    const { app, headers, createOrder } = await setup()
    const paid = await createOrder('52998224725', [
      { raffleId: 'sorteio-setembro', cardIds: ['card-001'] },
      { raffleId: 'sorteio-domingo', cardIds: ['card-001'] },
    ])
    await app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${paid}/approve`,
      headers,
      payload: { reason: 'Pix recebido na conta' },
    })
    await createOrder('52998224725', [
      { raffleId: 'sorteio-setembro', cardIds: ['card-002', 'card-003'] },
    ])

    const response = await app.inject({ method: 'GET', url: '/api/v1/admin/dashboard', headers })
    expect(response.statusCode).toBe(200)
    const summary = response.json<Summary>()

    expect(summary.totals).toMatchObject({
      customers: 1,
      paidTickets: 2,
      paidOrders: 1,
      revenueInCents: 1600,
      pendingTickets: 2,
      pendingOrders: 1,
      manualReviewOrders: 0,
    })
    expect(summary.dailySales).toHaveLength(30)
    expect(summary.dailySales.at(-1)).toEqual({
      day: '2026-09-24',
      revenueInCents: 1600,
      tickets: 2,
    })
    expect(summary.ordersByStatus).toContainEqual({ status: 'pending', orders: 1 })
    expect(summary.ticketsByRaffle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ raffleId: 'sorteio-setembro', tickets: 1, revenueInCents: 1000 }),
        expect.objectContaining({ raffleId: 'sorteio-domingo', tickets: 1, revenueInCents: 600 }),
      ]),
    )
    expect(summary.upcomingRaffles?.map(({ id }) => id)).toEqual([
      'sorteio-setembro',
      'sorteio-domingo',
    ])
    expect(summary.upcomingRaffles?.[0]?.paidTickets).toBe(1)
  })

  it('keeps local indicators when the ticket API fails', async () => {
    const tickets = new MockTicketGateway()
    tickets.getActiveRaffles = async () => {
      throw new Error('timeout')
    }
    const { app, headers } = await setup(tickets)

    const summary = (
      await app.inject({ method: 'GET', url: '/api/v1/admin/dashboard', headers })
    ).json<Summary>()
    expect(summary.upcomingRaffles).toBeNull()
    expect(summary.upcomingRafflesError).toBe(
      'Não foi possível consultar os sorteios na API de bilhetes.',
    )
    expect(summary.totals.customers).toBe(0)
  })

  it('requires a session', async () => {
    const { app } = await setup()
    const response = await app.inject({ method: 'GET', url: '/api/v1/admin/dashboard' })
    expect(response.statusCode).toBe(401)
  })
})
