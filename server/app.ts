import cors from '@fastify/cors'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { parseServerEnv, type ServerEnv } from './config/env.js'
import { AdminAuthService } from './domains/admin/admin-auth-service.js'
import { AdminDashboardRepository } from './domains/admin/admin-dashboard-repository.js'
import { AdminDashboardService } from './domains/admin/admin-dashboard-service.js'
import { AdminRaffleService } from './domains/admin/admin-raffle-service.js'
import { AdminRepository } from './domains/admin/admin-repository.js'
import { AdminSalesRepository } from './domains/admin/admin-sales-repository.js'
import { AdminSalesService } from './domains/admin/admin-sales-service.js'
import { AdminUserService } from './domains/admin/admin-user-service.js'
import { SiteSettingsService } from './domains/admin/site-settings.js'
import type { CustomerGateway } from './domains/customers/customer-gateway.js'
import { CustomerService } from './domains/customers/customer-service.js'
import { LiveCustomerGateway } from './domains/customers/live-customer-gateway.js'
import { MockCustomerGateway } from './domains/customers/mock-customer-gateway.js'
import { InfinitePayGateway } from './domains/payments/infinitepay-gateway.js'
import { MockPaymentGateway } from './domains/payments/mock-payment-gateway.js'
import type { PaymentGateway } from './domains/payments/payment-gateway.js'
import { OrderRepository } from './domains/orders/order-repository.js'
import { OrderService } from './domains/orders/order-service.js'
import { RemoteReservationRepository } from './domains/orders/remote-reservation-repository.js'
import { TicketReservationCoordinator } from './domains/orders/ticket-reservation-coordinator.js'
import { LiveTicketGateway } from './domains/tickets/live-ticket-gateway.js'
import { LiveTicketReservationGateway } from './domains/tickets/live-ticket-reservation-gateway.js'
import { MockTicketGateway } from './domains/tickets/mock-ticket-gateway.js'
import { MockTicketReservationGateway } from './domains/tickets/mock-ticket-reservation-gateway.js'
import { NoopTicketReservationGateway } from './domains/tickets/noop-ticket-reservation-gateway.js'
import type { ContestAdminGateway } from './domains/tickets/contest-admin-gateway.js'
import { LiveContestAdminGateway } from './domains/tickets/live-contest-admin-gateway.js'
import type { TicketGateway } from './domains/tickets/ticket-gateway.js'
import type { TicketReservationGateway } from './domains/tickets/ticket-reservation-gateway.js'
import { registerAdminRoutes } from './http/admin-routes.js'
import { registerRoutes } from './http/routes.js'
import { createDatabase } from './shared/database.js'
import { DomainError } from './shared/errors.js'

type AppOptions = {
  env?: ServerEnv
  tickets?: TicketGateway
  payments?: PaymentGateway
  customers?: CustomerGateway
  reservations?: TicketReservationGateway
  contestAdmin?: ContestAdminGateway
  logger?: boolean
  startWorker?: boolean
  now?: () => Date
}

export async function buildApp(options: AppOptions = {}) {
  const env = options.env ?? parseServerEnv()
  const app = Fastify({ logger: options.logger ?? true })
  const database = createDatabase(env.DATABASE_PATH)
  const now = options.now ?? (() => new Date())
  const tickets =
    options.tickets ??
    (env.TICKET_PROVIDER === 'live' ? new LiveTicketGateway(env, now) : new MockTicketGateway())
  const payments =
    options.payments ??
    (env.PAYMENT_PROVIDER === 'infinitepay'
      ? new InfinitePayGateway(env)
      : new MockPaymentGateway(env))
  const customerGateway =
    options.customers ??
    (env.TICKET_PROVIDER === 'live'
      ? new LiveCustomerGateway(env.TICKET_API_BASE_URL, env.TICKET_API_ALLOW_HTTP)
      : new MockCustomerGateway())
  const customers = new CustomerService(customerGateway)
  if (
    env.TICKET_PROVIDER === 'live' &&
    env.TICKET_API_ALLOW_HTTP &&
    new URL(env.TICKET_API_BASE_URL).protocol === 'http:'
  ) {
    app.log.warn(
      'TICKET_API_ALLOW_HTTP=true: CPF e telefone trafegam sem TLS até a API de bilhetes.',
    )
  }
  const reservationGateway =
    options.reservations ??
    (env.TICKET_RESERVATION_PROVIDER === 'live'
      ? new LiveTicketReservationGateway(env)
      : env.TICKET_RESERVATION_PROVIDER === 'mock'
        ? new MockTicketReservationGateway(env.TICKET_RESERVATION_TTL_MINUTES * 60_000, now)
        : new NoopTicketReservationGateway())
  const orderRepository = new OrderRepository(database, now)
  const service = new OrderService(
    orderRepository,
    tickets,
    payments,
    customers,
    new TicketReservationCoordinator(
      reservationGateway,
      new RemoteReservationRepository(database, now),
    ),
    env,
    now,
  )

  const adminRepository = new AdminRepository(database)
  const adminAuth = new AdminAuthService(adminRepository, now)
  if (env.ADMIN_BOOTSTRAP_LOGIN && env.ADMIN_BOOTSTRAP_PASSWORD) {
    const created = await adminAuth.bootstrap(
      env.ADMIN_BOOTSTRAP_LOGIN,
      'Administrador',
      env.ADMIN_BOOTSTRAP_PASSWORD,
    )
    if (created) app.log.info(`Administrador inicial "${env.ADMIN_BOOTSTRAP_LOGIN}" criado.`)
  }

  // Antes dos plugins: escopos registrados com app.register herdam o handler vigente.
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

  await app.register(cors, { origin: env.PUBLIC_APP_URL })
  const siteSettings = new SiteSettingsService(database, adminRepository, now)
  // Modo mock edita o próprio gateway de bilhetes, para a Home refletir a mudança.
  const contestAdmin =
    options.contestAdmin ??
    (env.TICKET_PROVIDER === 'live'
      ? new LiveContestAdminGateway(env)
      : tickets instanceof MockTicketGateway
        ? tickets
        : new MockTicketGateway())
  await registerRoutes(app, service, customers, siteSettings)
  await registerAdminRoutes(app, env, {
    auth: adminAuth,
    users: new AdminUserService(adminRepository, now),
    sales: new AdminSalesService(
      new AdminSalesRepository(database),
      orderRepository,
      service,
      adminRepository,
      now,
    ),
    raffles: new AdminRaffleService(contestAdmin, adminRepository, now),
    settings: siteSettings,
    dashboard: new AdminDashboardService(
      new AdminDashboardRepository(database),
      orderRepository,
      () => service.getActiveRaffles(),
      now,
    ),
  })

  let worker: ReturnType<typeof setInterval> | undefined
  if (options.startWorker !== false) {
    worker = setInterval(() => {
      void service.processNextPaymentEvent().catch((error: unknown) => app.log.error(error))
      void service.releaseAbandonedReservations().catch((error: unknown) => app.log.error(error))
    }, 5_000)
    worker.unref()
  }

  app.addHook('onClose', async () => {
    if (worker) clearInterval(worker)
    database.close()
  })
  return app
}
