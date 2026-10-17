import type { FastifyRequest } from 'fastify'
import type { ServerEnv } from '../config/env.js'
import type { AccountService, CustomerSession } from '../domains/accounts/account-service.js'
import { DomainError } from '../shared/errors.js'

export const CUSTOMER_SESSION_COOKIE = 'customer_session'
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function customerCookieOptions(env: ServerEnv) {
  return {
    path: '/api',
    httpOnly: true,
    sameSite: 'strict',
    secure: new URL(env.PUBLIC_APP_URL).protocol === 'https:',
  } as const
}

export function isAllowedOrigin(origin: string, env: ServerEnv) {
  return origin === new URL(env.PUBLIC_APP_URL).origin || env.ALLOWED_ORIGINS.includes(origin)
}

// SameSite=Strict já barra CSRF em navegadores atuais; Origin cobre os demais.
export function assertAllowedOrigin(request: FastifyRequest, env: ServerEnv) {
  const origin = request.headers.origin
  if (WRITE_METHODS.has(request.method) && origin && !isAllowedOrigin(origin, env)) {
    throw new DomainError('Origem não permitida.', 403, 'FORBIDDEN_ORIGIN')
  }
}

export function requireCustomer(
  request: FastifyRequest,
  accounts: AccountService,
): CustomerSession {
  const session = accounts.authenticate(request.cookies[CUSTOMER_SESSION_COOKIE])
  if (!session) throw new DomainError('Entre na sua conta para continuar.', 401, 'UNAUTHENTICATED')
  return session
}
