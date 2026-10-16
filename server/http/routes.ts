import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { ServerEnv } from '../config/env.js'
import type { AccountService } from '../domains/accounts/account-service.js'
import { isProfileComplete } from '../domains/accounts/account-types.js'
import type { SiteSettingsService } from '../domains/admin/site-settings.js'
import type { OrderService } from '../domains/orders/order-service.js'
import { createOrderInputSchema, paymentEventSchema } from '../domains/orders/order-types.js'
import { DomainError } from '../shared/errors.js'
import { assertAllowedOrigin, requireCustomer } from './customer-session.js'
import { presentOrder, presentPurchase } from './order-presenter.js'

const orderParamsSchema = z.object({ id: z.string().uuid() })
const raffleParamsSchema = z.object({ id: z.string().min(1) })
const orderQuerySchema = z.object({
  transaction_nsu: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
})

// Só opções do pedido vêm do navegador; o comprador é sempre o dono da sessão.
const orderOptionsSchema = z
  .object({
    beneficiaryName: z.string().trim().min(3).max(120).optional(),
    email: z.string().trim().toLowerCase().max(160).pipe(z.email()).optional(),
  })
  .passthrough()

export async function registerRoutes(
  app: FastifyInstance,
  env: ServerEnv,
  service: OrderService,
  accounts: AccountService,
  settings: SiteSettingsService,
) {
  app.get('/api/health', async () => ({ status: 'online' }))

  app.get('/api/v1/site-settings', async () => settings.getPublic())

  app.get('/api/v1/raffles/active', async () =>
    (await service.getActiveRaffles()).map(({ bannerUrl, ...raffle }) => ({
      ...raffle,
      hasBanner: Boolean(bannerUrl),
    })),
  )

  app.get('/api/v1/raffles/:id/banner', async (request, reply) => {
    const { id } = raffleParamsSchema.parse(request.params)
    const banner = await service.getRaffleBanner(id)
    return reply
      .header('Content-Type', banner.contentType)
      .header('Cache-Control', 'public, max-age=300')
      .send(banner.body)
  })

  app.get('/api/v1/raffles/:id/cards', async (request) => {
    const { id } = raffleParamsSchema.parse(request.params)
    const cards = await service.getAvailableTickets(id)
    return cards.map((card) => ({ ...card, available: true }))
  })

  app.post('/api/v1/orders', async (request, reply) => {
    assertAllowedOrigin(request, env)
    const { account } = requireCustomer(request, accounts)
    if (!isProfileComplete(account)) {
      throw new DomainError(
        'Complete seu cadastro em Meus dados antes de comprar.',
        400,
        'PROFILE_INCOMPLETE',
      )
    }
    const { beneficiaryName, email, ...selection } = orderOptionsSchema.parse(request.body)
    const order = await service.createOrder(
      createOrderInputSchema.parse({
        ...selection,
        customer: {
          name: account.name,
          cpf: account.cpf,
          phone: account.phone,
          email: email ?? account.email ?? undefined,
          address: account.address,
          beneficiaryName,
        },
      }),
    )
    return reply.status(201).send(presentOrder(order))
  })

  app.post('/api/v1/orders/:id/checkout', async (request) => {
    const { id } = orderParamsSchema.parse(request.params)
    return { checkoutUrl: await service.createCheckout(id) }
  })

  app.get('/api/v1/orders/mine', async (request, reply) => {
    const { account } = requireCustomer(request, accounts)
    reply.header('Cache-Control', 'no-store')
    return { orders: service.listOrdersByCpf(account.cpf).map(presentPurchase) }
  })

  app.get('/api/v1/orders/:id', async (request) => {
    const { id } = orderParamsSchema.parse(request.params)
    const query = orderQuerySchema.parse(request.query)
    if (query.transaction_nsu && query.slug) {
      return presentOrder(await service.reconcileRedirect(id, query.transaction_nsu, query.slug))
    }
    return presentOrder(service.getOrder(id))
  })

  app.post('/api/v1/webhooks/infinitepay', async (request) => {
    const result = service.acceptWebhook(paymentEventSchema.parse(request.body))
    if (result === 'created') {
      setImmediate(() => {
        void service.processNextPaymentEvent().catch((error: unknown) => app.log.error(error))
      })
    }
    return { success: true, message: null }
  })
}
