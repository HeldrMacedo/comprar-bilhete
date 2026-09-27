import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.js'
import type { ServerEnv } from '../../config/env.js'
import { MockCustomerGateway } from '../customers/mock-customer-gateway.js'
import { MockPaymentGateway } from '../payments/mock-payment-gateway.js'
import type { PaymentGateway } from '../payments/payment-gateway.js'
import { createDatabase } from '../../shared/database.js'
import { CustomerService } from '../customers/customer-service.js'
import { MockTicketGateway } from '../tickets/mock-ticket-gateway.js'
import { MockTicketReservationGateway } from '../tickets/mock-ticket-reservation-gateway.js'
import type { TicketReservationGateway } from '../tickets/ticket-reservation-gateway.js'
import { OrderRepository } from './order-repository.js'
import { OrderService } from './order-service.js'
import { RemoteReservationRepository } from './remote-reservation-repository.js'
import { TicketReservationCoordinator } from './ticket-reservation-coordinator.js'

const env: ServerEnv = {
  SERVER_PORT: 3333,
  DATABASE_PATH: ':memory:',
  PUBLIC_APP_URL: 'http://localhost:5173',
  PUBLIC_API_URL: 'http://localhost:3333',
  ORDER_EXPIRATION_MINUTES: 15,
  TICKET_PROVIDER: 'mock',
  PAYMENT_PROVIDER: 'mock',
  TICKET_API_BASE_URL: 'http://66.94.99.64:9090',
  TICKET_API_ALLOW_HTTP: false,
  TICKET_ESTABLISHMENT_ID: '4734',
  TICKET_REGIONAL_ID: '57',
  TICKET_RESERVATION_PROVIDER: 'none',
  TICKET_RESERVATION_TTL_MINUTES: 30,
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
  it('cria um pedido com cartelas de dois sorteios e soma os preços de cada um', async () => {
    const app = await buildApp({ env, logger: false, startWorker: false })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: {
        raffles: [
          {
            raffleId: 'sorteio-setembro',
            selection: { mode: 'manual', cardIds: ['card-001'] },
          },
          {
            raffleId: 'sorteio-domingo',
            selection: { mode: 'manual', cardIds: ['card-001'] },
          },
        ],
        customer: existingCustomer,
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      totalInCents: 1600,
      items: [
        { id: 'card-001', raffleId: 'sorteio-setembro', unitPriceInCents: 1000 },
        { id: 'card-001', raffleId: 'sorteio-domingo', unitPriceInCents: 600 },
      ],
    })

    const { id } = response.json<{ id: string }>()
    await app.inject({ method: 'POST', url: `/api/v1/orders/${id}/checkout` })
    const paid = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${id}?transaction_nsu=mock-${id}&slug=mock-${id}`,
    })
    expect(paid.json()).toMatchObject({ status: 'paid', totalInCents: 1600 })
    for (const raffleId of ['sorteio-setembro', 'sorteio-domingo']) {
      const cards = await app.inject({ method: 'GET', url: `/api/v1/raffles/${raffleId}/cards` })
      expect(cards.json<Array<{ id: string }>>().some((card) => card.id === 'card-001')).toBe(false)
    }
  })

  it('desfaz todas as reservas se uma das seleções conjuntas conflitar', async () => {
    const app = await buildApp({ env, logger: false, startWorker: false })
    apps.push(app)
    const oneSelection = (raffleId: string, cardId: string) => ({
      raffles: [{ raffleId, selection: { mode: 'manual', cardIds: [cardId] } }],
      customer: existingCustomer,
    })
    const reserved = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: oneSelection('sorteio-domingo', 'card-001'),
    })
    expect(reserved.statusCode).toBe(201)

    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: {
        raffles: [
          { raffleId: 'sorteio-setembro', selection: { mode: 'manual', cardIds: ['card-002'] } },
          { raffleId: 'sorteio-domingo', selection: { mode: 'manual', cardIds: ['card-001'] } },
        ],
        customer: existingCustomer,
      },
    })
    expect(conflict.statusCode).toBe(409)

    const afterRollback = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: oneSelection('sorteio-setembro', 'card-002'),
    })
    expect(afterRollback.statusCode).toBe(201)
  })

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

  it('reserva cartela manual com posição de lote zero, como a API de bilhetes informa', async () => {
    const tickets = new MockTicketGateway()
    const original = tickets.getAvailableTicket.bind(tickets)
    tickets.getAvailableTicket = async (raffleId, ticketId) => {
      const ticket = await original(raffleId, ticketId)
      return ticket && { ...ticket, validationBatch: '', batchPosition: 0 }
    }
    const app = await buildApp({ env, tickets, logger: false, startWorker: false })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: {
        raffles: [
          { raffleId: 'sorteio-setembro', selection: { mode: 'manual', cardIds: ['card-001'] } },
        ],
        customer: existingCustomer,
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ items: [{ id: 'card-001' }] })
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

  it('deduplica entregas simultaneas do mesmo webhook', async () => {
    const harness = await createPaymentHarness()
    const [first, second] = await Promise.all([
      harness.app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/infinitepay',
        payload: harness.paidWebhook,
      }),
      harness.app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/infinitepay',
        payload: harness.paidWebhook,
      }),
    ])

    expect([first.statusCode, second.statusCode]).toEqual([200, 200])
    await vi.waitFor(() => expect(harness.fulfillOrder).toHaveBeenCalledTimes(1))
  })

  it('mantem pagamento tardio em analise sem entregar cartelas', async () => {
    let currentTime = new Date('2026-09-23T10:00:00.000Z')
    const harness = await createPaymentHarness(() => currentTime)
    currentTime = new Date('2026-09-23T10:16:00.000Z')
    await harness.app.inject({ method: 'GET', url: `/api/v1/orders/${harness.orderId}` })

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/infinitepay',
      payload: harness.paidWebhook,
    })

    await vi.waitFor(async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: `/api/v1/orders/${harness.orderId}`,
      })
      expect(response.json()).toMatchObject({ status: 'manual_review' })
    })
    expect(harness.fulfillOrder).not.toHaveBeenCalled()
  })

  it('reutiliza o checkout sem criar outra cobranca', async () => {
    const payments = new MockPaymentGateway(env)
    const createCheckout = vi.spyOn(payments, 'createCheckout')
    const harness = await createPaymentHarness(undefined, payments)

    const first = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/orders/${harness.orderId}/checkout`,
    })
    const second = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/orders/${harness.orderId}/checkout`,
    })

    expect(second.json()).toEqual(first.json())
    expect(createCheckout).toHaveBeenCalledTimes(1)
  })

  it('mantem pagamento confirmado em analise quando a entrega falha', async () => {
    const harness = await createPaymentHarness()
    harness.fulfillOrder.mockRejectedValueOnce(new Error('Falha externa'))

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/infinitepay',
      payload: harness.paidWebhook,
    })

    await vi.waitFor(async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: `/api/v1/orders/${harness.orderId}`,
      })
      expect(response.json()).toMatchObject({ status: 'manual_review' })
    })
  })

  it('nao entrega cartelas quando o payment_check retorna valor divergente', async () => {
    const payments: PaymentGateway = {
      createCheckout: async () => 'https://checkout.infinitepay.io/divergent',
      verifyPayment: async () => ({ paid: true, amountInCents: 999, captureMethod: 'pix' }),
    }
    const harness = await createPaymentHarness(undefined, payments)

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/infinitepay',
      payload: harness.paidWebhook,
    })

    await vi.waitFor(async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: `/api/v1/orders/${harness.orderId}`,
      })
      expect(response.json()).toMatchObject({ status: 'manual_review' })
    })
    expect(harness.fulfillOrder).not.toHaveBeenCalled()
  })

  it('cadastra cliente novo somente apos pagamento verificado', async () => {
    const customers = new MockCustomerGateway()
    const createCustomer = vi.spyOn(customers, 'create')
    const app = await buildApp({
      env,
      customers,
      logger: false,
      startWorker: false,
      now: () => new Date('2026-09-23T10:00:00.000Z'),
    })
    apps.push(app)
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: {
        raffleId: 'sorteio-setembro',
        selection: { mode: 'manual', cardIds: ['card-030'] },
        customer: {
          name: 'Cliente Novo',
          cpf: '11144477735',
          phone: '84999998888',
          address: {
            zipCode: '59062300',
            street: 'Avenida Lima e Silva',
            number: '129',
            neighborhood: 'Nazare',
            city: 'Natal',
            state: 'RN',
          },
        },
      },
    })
    const { id } = created.json<{ id: string }>()
    expect(createCustomer).not.toHaveBeenCalled()
    await app.inject({ method: 'POST', url: `/api/v1/orders/${id}/checkout` })
    await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/infinitepay',
      payload: {
        invoice_slug: `mock-${id}`,
        amount: 1000,
        paid_amount: 1000,
        installments: 1,
        capture_method: 'pix',
        transaction_nsu: `mock-${id}`,
        order_nsu: id,
        receipt_url: 'https://example.com/comprovante',
        items: [],
      },
    })

    await vi.waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1))
  })
})

describe('reserva externa do bilhete', () => {
  const ttlMs = 30 * 60_000
  const key = (ticketNumber: string) => ({ raffleId: 'sorteio-setembro', ticketNumber })

  it('recusa cartela reservada por outro canal e desfaz as demais reservas', async () => {
    const reservations = new MockTicketReservationGateway(ttlMs)
    reservations.reserveFromAnotherChannel(key('card-041'))
    const app = await buildApp({ env, reservations, logger: false, startWorker: false })
    apps.push(app)

    const conflict = await createOrder(app, { mode: 'manual', cardIds: ['card-040', 'card-041'] })

    expect(conflict.statusCode).toBe(409)
    expect(conflict.json()).toMatchObject({ code: 'TICKET_RESERVED' })
    expect(await reservations.inspect(key('card-040'))).toMatchObject({ reserved: false })
    const retry = await createOrder(app, { mode: 'manual', cardIds: ['card-040'] })
    expect(retry.statusCode).toBe(201)
  })

  it('não valida o bilhete quando a reserva externa foi perdida antes do pagamento', async () => {
    const reservations = new MockTicketReservationGateway(ttlMs)
    const harness = await createPaymentHarness(undefined, undefined, reservations)
    reservations.reserveFromAnotherChannel(key('card-020'))

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/orders/${harness.orderId}?transaction_nsu=mock-${harness.orderId}&slug=mock-${harness.orderId}`,
    })

    expect(response.json()).toMatchObject({ status: 'manual_review' })
    expect(harness.fulfillOrder).not.toHaveBeenCalled()
  })

  it('valida o bilhete quando o pedido mantém a reserva externa', async () => {
    const reservations = new MockTicketReservationGateway(ttlMs)
    const harness = await createPaymentHarness(undefined, undefined, reservations)

    const paid = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/orders/${harness.orderId}?transaction_nsu=mock-${harness.orderId}&slug=mock-${harness.orderId}`,
    })

    expect(paid.json()).toMatchObject({ status: 'paid' })
    expect(harness.fulfillOrder).toHaveBeenCalledTimes(1)
  })

  it('libera a reserva externa quando o pedido expira', async () => {
    let currentTime = new Date('2026-09-23T10:00:00.000Z')
    const now = () => currentTime
    const database = createDatabase(':memory:')
    const gateway = new MockTicketReservationGateway(ttlMs, now)
    const service = new OrderService(
      new OrderRepository(database, now),
      new MockTicketGateway(),
      new MockPaymentGateway(env),
      new CustomerService(new MockCustomerGateway()),
      new TicketReservationCoordinator(gateway, new RemoteReservationRepository(database, now)),
      env,
      now,
    )
    await service.createOrder({
      raffleId: 'sorteio-setembro',
      selection: { mode: 'manual', cardIds: ['card-045'] },
      customer: existingCustomer,
    })
    expect(await gateway.inspect(key('card-045'))).toMatchObject({ reserved: true })

    currentTime = new Date('2026-09-23T10:16:00.000Z')
    await service.releaseAbandonedReservations()

    expect(await gateway.inspect(key('card-045'))).toMatchObject({ reserved: false })
    database.close()
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

async function createPaymentHarness(
  now: (() => Date) | undefined = () => new Date('2026-09-23T10:00:00.000Z'),
  payments: PaymentGateway = new MockPaymentGateway(env),
  reservations?: TicketReservationGateway,
) {
  const tickets = new MockTicketGateway()
  const fulfillOrder = vi.spyOn(tickets, 'fulfillOrder')
  const app = await buildApp({
    env,
    tickets,
    payments,
    reservations,
    customers: new MockCustomerGateway(),
    now,
    logger: false,
    startWorker: false,
  })
  apps.push(app)
  const created = await createOrder(app, { mode: 'manual', cardIds: ['card-020'] })
  const { id: orderId } = created.json<{ id: string }>()
  await app.inject({ method: 'POST', url: `/api/v1/orders/${orderId}/checkout` })
  return {
    app,
    orderId,
    fulfillOrder,
    paidWebhook: {
      invoice_slug: `mock-${orderId}`,
      amount: 1000,
      paid_amount: 1000,
      installments: 1,
      capture_method: 'pix',
      transaction_nsu: `mock-${orderId}`,
      order_nsu: orderId,
      receipt_url: 'https://example.com/comprovante',
      items: [],
    },
  }
}
