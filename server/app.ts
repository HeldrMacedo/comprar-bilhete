import cors from '@fastify/cors'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { parseServerEnv, type ServerEnv } from './config/env.js'
import { InfinitePayGateway } from './domains/payments/infinitepay-gateway.js'
import { MockPaymentGateway } from './domains/payments/mock-payment-gateway.js'
import type { PaymentGateway } from './domains/payments/payment-gateway.js'
import { OrderRepository } from './domains/orders/order-repository.js'
import { OrderService } from './domains/orders/order-service.js'
import { LiveTicketGateway } from './domains/tickets/live-ticket-gateway.js'
import { MockTicketGateway } from './domains/tickets/mock-ticket-gateway.js'
import type { TicketGateway } from './domains/tickets/ticket-gateway.js'
import { registerRoutes } from './http/routes.js'
import { createDatabase } from './shared/database.js'
import { DomainError } from './shared/errors.js'

type AppOptions = {
  env?: ServerEnv
  tickets?: TicketGateway
  payments?: PaymentGateway
  logger?: boolean
  startWorker?: boolean
}

export async function buildApp(options: AppOptions = {}) {
  const env = options.env ?? parseServerEnv()
  const app = Fastify({ logger: options.logger ?? true })
  const database = createDatabase(env.DATABASE_PATH)
  const tickets =
    options.tickets ??
    (env.TICKET_PROVIDER === 'live' ? new LiveTicketGateway(env) : new MockTicketGateway())
  const payments =
    options.payments ??
    (env.PAYMENT_PROVIDER === 'infinitepay'
      ? new InfinitePayGateway(env)
      : new MockPaymentGateway(env))
  const service = new OrderService(new OrderRepository(database), tickets, payments, env)

  await app.register(cors, { origin: env.PUBLIC_APP_URL })
  await registerRoutes(app, service)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ message: 'Dados inválidos.', issues: error.issues })
    }
    if (error instanceof DomainError) {
      return reply.status(error.statusCode).send({ message: error.message, code: error.code })
    }
    app.log.error(error)
    return reply.status(500).send({ message: 'Erro interno do servidor.' })
  })

  let worker: ReturnType<typeof setInterval> | undefined
  if (options.startWorker !== false) {
    worker = setInterval(() => {
      void service.processNextPaymentEvent().catch((error: unknown) => app.log.error(error))
    }, 5_000)
    worker.unref()
  }

  app.addHook('onClose', async () => {
    if (worker) clearInterval(worker)
    database.close()
  })
  return app
}
