import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { parseServerEnv } from '../config/env.js'
import { MockTicketGateway } from '../domains/tickets/mock-ticket-gateway.js'
import { ADMIN_SESSION_COOKIE } from './admin-routes.js'

const PASSWORD = 'senha-segura-123'
const ORIGIN = 'http://localhost:5173'
const maria = { name: 'Maria da Silva', cpf: '52998224725', phone: '84999855367' }
const joao = {
  name: 'João Souza',
  cpf: '39053344705',
  phone: '84988887777',
  address: {
    zipCode: '59000000',
    street: 'RUA A',
    number: '10',
    neighborhood: 'CENTRO',
    city: 'NATAL',
    state: 'RN',
  },
}

const apps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

async function setup(now: () => Date = () => new Date()) {
  const tickets = new MockTicketGateway()
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

  async function createOrder(customer: object, cardIds: string[]) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: {
        raffleId: 'sorteio-setembro',
        selection: { mode: 'manual', cardIds },
        customer,
      },
    })
    expect(response.statusCode).toBe(201)
    return response.json<{ id: string }>().id
  }

  return { app, headers, tickets, createOrder }
}

type AdminOrder = { id: string; status: string; captureMethod?: string; lastError?: string }

describe('admin sales', () => {
  it('lists orders with search, status filter and pagination', async () => {
    const { app, headers, createOrder } = await setup()
    await createOrder(maria, ['card-001'])
    const second = await createOrder(joao, ['card-002', 'card-003'])

    const all = await app.inject({ method: 'GET', url: '/api/v1/admin/orders', headers })
    expect(all.json()).toMatchObject({ total: 2, page: 1, pageSize: 20 })

    const byName = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/orders?q=${encodeURIComponent('joão')}`,
      headers,
    })
    expect(byName.json<{ orders: AdminOrder[] }>().orders.map(({ id }) => id)).toEqual([second])

    const byPhone = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/orders?q=98888-7777',
      headers,
    })
    expect(byPhone.json<{ total: number }>().total).toBe(1)

    const byTicket = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/orders?q=${encodeURIComponent('#003')}`,
      headers,
    })
    expect(byTicket.json<{ orders: AdminOrder[] }>().orders.map(({ id }) => id)).toEqual([second])

    const paged = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/orders?pageSize=1&page=2&status=pending&q=',
      headers,
    })
    expect(paged.json()).toMatchObject({ total: 2, orders: [expect.anything()] })

    const paid = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/orders?status=paid',
      headers,
    })
    expect(paid.json()).toMatchObject({ total: 0, orders: [] })
  })

  it('approves a pending order through the regular fulfillment and audits the reason', async () => {
    const { app, headers, tickets, createOrder } = await setup()
    const orderId = await createOrder(maria, ['card-001'])

    const tooShort = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${orderId}/approve`,
      headers,
      payload: { reason: 'ok' },
    })
    expect(tooShort.statusCode).toBe(400)

    const approved = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${orderId}/approve`,
      headers,
      payload: { reason: 'Pix recebido direto na conta' },
    })
    expect(approved.statusCode).toBe(200)
    expect(approved.json<{ order: AdminOrder }>().order).toMatchObject({
      status: 'paid',
      captureMethod: 'manual',
    })
    expect(await tickets.getAvailableTicket('sorteio-setembro', 'card-001')).toBeNull()

    const again = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${orderId}/approve`,
      headers,
      payload: { reason: 'Pix recebido direto na conta' },
    })
    expect(again.statusCode).toBe(409)
  })

  it('refuses to approve an expired order', async () => {
    let current = new Date('2026-10-08T12:00:00.000Z')
    const { app, headers, createOrder } = await setup(() => current)
    const orderId = await createOrder(maria, ['card-001'])
    current = new Date('2026-10-08T13:00:00.000Z')

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${orderId}/approve`,
      headers,
      payload: { reason: 'Pix recebido direto na conta' },
    })
    expect(response.statusCode).toBe(409)
  })

  it('retries a manual review order only while its tickets are still available', async () => {
    const { app, headers, tickets, createOrder } = await setup()
    const orderId = await createOrder(maria, ['card-001'])
    const failing = tickets.fulfillOrder.bind(tickets)
    let fail = true
    tickets.fulfillOrder = async (order) => {
      if (fail) throw new Error('API de bilhetes fora do ar')
      return failing(order)
    }

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${orderId}/approve`,
      headers,
      payload: { reason: 'Pix recebido direto na conta' },
    })
    expect(first.json<{ order: AdminOrder }>().order).toMatchObject({
      status: 'manual_review',
      lastError: 'API de bilhetes fora do ar',
    })

    fail = false
    const retry = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${orderId}/approve`,
      headers,
      payload: { reason: 'API voltou, nova tentativa' },
    })
    expect(retry.json<{ order: AdminOrder }>().order.status).toBe('paid')
  })

  it('blocks retry when a ticket was sold elsewhere', async () => {
    const { app, headers, tickets, createOrder } = await setup()
    const orderId = await createOrder(maria, ['card-001'])
    tickets.fulfillOrder = async () => {
      throw new Error('Falha externa')
    }
    await app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${orderId}/approve`,
      headers,
      payload: { reason: 'Pix recebido direto na conta' },
    })
    tickets.getAvailableTicket = async () => null

    const retry = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${orderId}/approve`,
      headers,
      payload: { reason: 'Nova tentativa de entrega' },
    })
    expect(retry.statusCode).toBe(409)
    expect(retry.json()).toMatchObject({ code: 'TICKET_UNAVAILABLE' })
  })

  it('cancels a pending order and frees its tickets', async () => {
    const { app, headers, createOrder } = await setup()
    const orderId = await createOrder(maria, ['card-001'])

    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${orderId}/cancel`,
      headers,
      payload: { reason: 'Cliente desistiu da compra' },
    })
    expect(cancelled.json<{ order: AdminOrder }>().order.status).toBe('cancelled')

    await createOrder(joao, ['card-001'])
  })

  it('exports filtered sales as Excel-friendly CSV', async () => {
    const { app, headers, createOrder } = await setup()
    await createOrder(maria, ['card-001'])

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/orders/export?status=pending',
      headers,
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    expect(response.headers['content-disposition']).toMatch(/attachment; filename="vendas-/)
    const [header, row] = response.body.replace('﻿', '').split('\r\n')
    expect(response.body.startsWith('﻿')).toBe(true)
    expect(header).toContain('Pedido;Data;Status;Cliente;CPF')
    expect(row).toContain(';Pendente;Maria da Silva;52998224725;84999855367;')
    expect(row).toContain(';10,00;')
  })
})

describe('admin customers', () => {
  it('groups orders by CPF using the latest data and exports them', async () => {
    const { app, headers, createOrder } = await setup()
    const first = await createOrder(joao, ['card-001'])
    await app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${first}/approve`,
      headers,
      payload: { reason: 'Pix recebido direto na conta' },
    })
    await createOrder(joao, ['card-002', 'card-003'])
    await createOrder(maria, ['card-004'])

    const list = await app.inject({ method: 'GET', url: '/api/v1/admin/customers', headers })
    expect(list.json()).toMatchObject({ total: 2 })
    const paying = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/customers?purchase=paid&q=souza',
      headers,
    })
    expect(paying.json()).toMatchObject({
      total: 1,
      customers: [
        {
          cpf: '39053344705',
          name: 'João Souza',
          orderCount: 2,
          paidOrderCount: 1,
          paidTotalInCents: 1000,
          ticketCount: 1,
          address: { city: 'NATAL' },
        },
      ],
    })

    const csv = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/customers/export?purchase=paid',
      headers,
    })
    expect(csv.body).toContain(
      'João Souza;39053344705;84988887777;59000000;RUA A;10;;CENTRO;NATAL;RN;2;1;1;10,00',
    )
  })

  it('requires a session for exports', async () => {
    const { app } = await setup()
    const response = await app.inject({ method: 'GET', url: '/api/v1/admin/customers/export' })
    expect(response.statusCode).toBe(401)
  })
})
