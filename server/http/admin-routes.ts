import cookie from '@fastify/cookie'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { ServerEnv } from '../config/env.js'
import type { AdminAuthService, AdminSession } from '../domains/admin/admin-auth-service.js'
import {
  createAdminUserInputSchema,
  loginInputSchema,
  updateAdminUserInputSchema,
} from '../domains/admin/admin-types.js'
import type { AdminDashboardService } from '../domains/admin/admin-dashboard-service.js'
import type { AdminRaffleService } from '../domains/admin/admin-raffle-service.js'
import {
  customerFiltersSchema,
  salesFiltersSchema,
} from '../domains/admin/admin-sales-repository.js'
import {
  orderActionInputSchema,
  type AdminSalesService,
} from '../domains/admin/admin-sales-service.js'
import type { AdminUserService } from '../domains/admin/admin-user-service.js'
import {
  siteSettingsInputSchema,
  type SiteSettingsService,
} from '../domains/admin/site-settings.js'
import {
  contestSourceSchema,
  contestValuesSchema,
} from '../domains/tickets/contest-admin-gateway.js'
import { DomainError } from '../shared/errors.js'
import { presentAdminOrder } from './admin-presenter.js'
import { createFailureLimiter } from './rate-limit.js'

export const ADMIN_SESSION_COOKIE = 'admin_session'
const ADMIN_PREFIX = '/api/v1/admin'
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const userParamsSchema = z.object({ id: z.string().uuid() })
const orderParamsSchema = z.object({ id: z.string().uuid() })
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

// Query string vazia (campo de filtro limpo) equivale a filtro ausente.
function withoutEmpty(query: unknown) {
  if (typeof query !== 'object' || query === null) return {}
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== ''))
}

function splitPage(query: unknown) {
  const { page, pageSize, ...filters } = withoutEmpty(query)
  return { page: pageSchema.parse({ page, pageSize }), filters }
}

function csvFileName(prefix: string, now: Date) {
  return `${prefix}-${now.toISOString().slice(0, 10)}.csv`
}

export type AdminServices = {
  auth: AdminAuthService
  users: AdminUserService
  sales: AdminSalesService
  dashboard: AdminDashboardService
  raffles: AdminRaffleService
  settings: SiteSettingsService
}

const sessions = new WeakMap<FastifyRequest, AdminSession>()

// Disponível apenas nas rotas registradas dentro do escopo protegido.
export function requireAdminSession(request: FastifyRequest) {
  const session = sessions.get(request)
  if (!session) throw new DomainError('Faça login para continuar.', 401, 'ADMIN_UNAUTHENTICATED')
  return session
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  env: ServerEnv,
  services: AdminServices,
) {
  const allowedOrigin = new URL(env.PUBLIC_APP_URL).origin
  const cookieOptions = {
    path: ADMIN_PREFIX,
    httpOnly: true,
    sameSite: 'strict',
    secure: new URL(env.PUBLIC_APP_URL).protocol === 'https:',
  } as const
  const loginFailures = createFailureLimiter(10, 60_000)

  await app.register(async (scope) => {
    await scope.register(cookie)

    // SameSite=Strict já barra CSRF em navegadores atuais; Origin cobre os demais.
    scope.addHook('onRequest', async (request) => {
      const origin = request.headers.origin
      if (WRITE_METHODS.has(request.method) && origin && origin !== allowedOrigin) {
        throw new DomainError('Origem não permitida.', 403, 'ADMIN_FORBIDDEN_ORIGIN')
      }
    })
    scope.addHook('onSend', async (_request, reply) => {
      reply.header('Cache-Control', 'no-store')
    })

    scope.post(`${ADMIN_PREFIX}/session`, async (request, reply) => {
      loginFailures.assertAllowed(request.ip)
      const input = loginInputSchema.parse(request.body)
      const { token, user } = await services.auth
        .login(input.login, input.password)
        .catch((error: unknown) => {
          loginFailures.recordFailure(request.ip)
          throw error
        })
      // Cookie de sessão do navegador; a validade real é controlada no servidor.
      reply.setCookie(ADMIN_SESSION_COOKIE, token, cookieOptions)
      return { user }
    })

    scope.get(`${ADMIN_PREFIX}/session`, async (request) => {
      const session = services.auth.authenticate(request.cookies[ADMIN_SESSION_COOKIE])
      if (!session) {
        throw new DomainError('Faça login para continuar.', 401, 'ADMIN_UNAUTHENTICATED')
      }
      return { user: session.user }
    })

    scope.delete(`${ADMIN_PREFIX}/session`, async (request, reply) => {
      const session = services.auth.authenticate(request.cookies[ADMIN_SESSION_COOKIE])
      if (session) services.auth.logout(session)
      reply.clearCookie(ADMIN_SESSION_COOKIE, cookieOptions)
      return reply.status(204).send()
    })

    await scope.register(async (protectedScope) => {
      protectedScope.addHook('preHandler', async (request, reply: FastifyReply) => {
        const session = services.auth.authenticate(request.cookies[ADMIN_SESSION_COOKIE])
        if (!session) {
          reply.clearCookie(ADMIN_SESSION_COOKIE, cookieOptions)
          throw new DomainError('Faça login para continuar.', 401, 'ADMIN_UNAUTHENTICATED')
        }
        sessions.set(request, session)
      })

      protectedScope.get(`${ADMIN_PREFIX}/dashboard`, async () => services.dashboard.summary())

      protectedScope.get(`${ADMIN_PREFIX}/raffles`, async () => ({
        raffles: await services.raffles.list(),
      }))

      protectedScope.put(`${ADMIN_PREFIX}/raffles/:source`, async (request) => {
        const { source } = z.object({ source: contestSourceSchema }).parse(request.params)
        const raffle = await services.raffles.update(
          requireAdminSession(request),
          source,
          contestValuesSchema.parse(request.body),
        )
        return { raffle }
      })

      protectedScope.get(`${ADMIN_PREFIX}/settings`, async () => services.settings.getAdmin())

      protectedScope.put(`${ADMIN_PREFIX}/settings`, async (request) => {
        const { youtubeUrl } = siteSettingsInputSchema.parse(request.body)
        return services.settings.update(requireAdminSession(request), youtubeUrl)
      })

      protectedScope.get(`${ADMIN_PREFIX}/orders`, async (request) => {
        const { page, filters } = splitPage(request.query)
        const result = services.sales.listOrders(salesFiltersSchema.parse(filters), page)
        return { ...page, total: result.total, orders: result.orders.map(presentAdminOrder) }
      })

      protectedScope.get(`${ADMIN_PREFIX}/orders/export`, async (request, reply) => {
        const filters = salesFiltersSchema.parse(withoutEmpty(request.query))
        const csv = services.sales.exportOrders(requireAdminSession(request), filters)
        return reply
          .type('text/csv; charset=utf-8')
          .header(
            'Content-Disposition',
            `attachment; filename="${csvFileName('vendas', new Date())}"`,
          )
          .send(csv)
      })

      protectedScope.post(`${ADMIN_PREFIX}/orders/:id/approve`, async (request) => {
        const { id } = orderParamsSchema.parse(request.params)
        const { reason } = orderActionInputSchema.parse(request.body)
        const order = await services.sales.approve(requireAdminSession(request), id, reason)
        return { order: presentAdminOrder(order) }
      })

      protectedScope.post(`${ADMIN_PREFIX}/orders/:id/cancel`, async (request) => {
        const { id } = orderParamsSchema.parse(request.params)
        const { reason } = orderActionInputSchema.parse(request.body)
        const order = await services.sales.cancel(requireAdminSession(request), id, reason)
        return { order: presentAdminOrder(order) }
      })

      protectedScope.get(`${ADMIN_PREFIX}/customers`, async (request) => {
        const { page, filters } = splitPage(request.query)
        const result = services.sales.listCustomers(customerFiltersSchema.parse(filters), page)
        return { ...page, ...result }
      })

      protectedScope.get(`${ADMIN_PREFIX}/customers/export`, async (request, reply) => {
        const filters = customerFiltersSchema.parse(withoutEmpty(request.query))
        const csv = services.sales.exportCustomers(requireAdminSession(request), filters)
        return reply
          .type('text/csv; charset=utf-8')
          .header(
            'Content-Disposition',
            `attachment; filename="${csvFileName('clientes', new Date())}"`,
          )
          .send(csv)
      })

      protectedScope.get(`${ADMIN_PREFIX}/users`, async () => ({
        users: services.users.list(),
      }))

      protectedScope.post(`${ADMIN_PREFIX}/users`, async (request, reply) => {
        const user = await services.users.create(
          requireAdminSession(request),
          createAdminUserInputSchema.parse(request.body),
        )
        return reply.status(201).send({ user })
      })

      protectedScope.patch(`${ADMIN_PREFIX}/users/:id`, async (request) => {
        const { id } = userParamsSchema.parse(request.params)
        const user = await services.users.update(
          requireAdminSession(request),
          id,
          updateAdminUserInputSchema.parse(request.body),
        )
        return { user }
      })

      protectedScope.delete(`${ADMIN_PREFIX}/users/:id`, async (request, reply) => {
        const { id } = userParamsSchema.parse(request.params)
        services.users.delete(requireAdminSession(request), id)
        return reply.status(204).send()
      })
    })
  })
}
