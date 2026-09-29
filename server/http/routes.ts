import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { CustomerService } from '../domains/customers/customer-service.js'
import type { OrderService } from '../domains/orders/order-service.js'
import { createOrderInputSchema, paymentEventSchema } from '../domains/orders/order-types.js'
import { presentOrder, presentPurchase } from './order-presenter.js'
import { createRateLimiter } from './rate-limit.js'

const orderParamsSchema = z.object({ id: z.string().uuid() })
const raffleParamsSchema = z.object({ id: z.string().min(1) })
const orderQuerySchema = z.object({
  transaction_nsu: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
})

const customerLookupQuerySchema = z
  .object({ cpf: z.string().regex(/^\d{11}$/, 'Informe um CPF com 11 dígitos.') })
  .strict()

const purchaseLookupBodySchema = z
  .object({ cpf: z.string().regex(/^\d{11}$/, 'Informe um CPF com 11 dígitos.') })
  .strict()

export async function registerRoutes(
  app: FastifyInstance,
  service: OrderService,
  customers: CustomerService,
) {
  app.get('/api/health', async () => ({ status: 'online' }))

  const limitPurchaseLookup = createRateLimiter(10, 60_000)
  // POST mantém o CPF fora da URL e, portanto, dos logs de acesso.
  app.post('/api/v1/orders/lookup', async (request) => {
    limitPurchaseLookup(request.ip)
    const { cpf } = purchaseLookupBodySchema.parse(request.body)
    return { orders: service.listOrdersByCpf(cpf).map(presentPurchase) }
  })

  app.get('/api/v1/customers/lookup', async (request) => {
    const query = customerLookupQuerySchema.parse(request.query)
    return customers.lookup(query)
  })

  app.get('/api/v1/raffles/active', async () => service.getActiveRaffles())

  app.get('/api/v1/raffles/:id/cards', async (request) => {
    const { id } = raffleParamsSchema.parse(request.params)
    const cards = await service.getAvailableTickets(id)
    return cards.map((card) => ({ ...card, available: true }))
  })

  app.post('/api/v1/orders', async (request, reply) => {
    const order = await service.createOrder(createOrderInputSchema.parse(request.body))
    return reply.status(201).send(presentOrder(order))
  })

  app.post('/api/v1/orders/:id/checkout', async (request) => {
    const { id } = orderParamsSchema.parse(request.params)
    return { checkoutUrl: await service.createCheckout(id) }
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
