import type { FastifyInstance, FastifyReply } from 'fastify'
import type { ServerEnv } from '../config/env.js'
import type { AccountService } from '../domains/accounts/account-service.js'
import {
  identifyInputSchema,
  loginInputSchema,
  registerInputSchema,
  requestCodeInputSchema,
  setPasswordInputSchema,
  updateProfileInputSchema,
} from '../domains/accounts/account-types.js'
import {
  CUSTOMER_SESSION_COOKIE,
  assertAllowedOrigin,
  customerCookieOptions,
  requireCustomer,
} from './customer-session.js'
import { createFailureLimiter, createRateLimiter } from './rate-limit.js'

const PREFIX = '/api/v1/account'

export async function registerAccountRoutes(
  app: FastifyInstance,
  env: ServerEnv,
  accounts: AccountService,
) {
  const cookieOptions = customerCookieOptions(env)
  const limitIdentify = createRateLimiter(env.ACCOUNT_IDENTIFY_LIMIT_PER_MINUTE, 60_000)
  const limitCodes = createRateLimiter(env.ACCOUNT_CODE_LIMIT_PER_MINUTE, 60_000)
  const loginFailuresByIp = createFailureLimiter(10, 60_000)
  const loginFailuresByCpf = createFailureLimiter(5, 15 * 60_000)
  const codeFailuresByIp = createFailureLimiter(10, 60_000)
  // Por CPF além do IP: a tentativa de adivinhar o código pode vir de vários IPs.
  const codeFailuresByCpf = createFailureLimiter(10, 60 * 60_000)

  function startSession(reply: FastifyReply, token: string) {
    // Cookie de sessão do navegador; a validade real é controlada no servidor.
    reply.setCookie(CUSTOMER_SESSION_COOKIE, token, cookieOptions)
  }

  function recordCodeFailure(ip: string, cpf: string) {
    return (error: unknown): never => {
      codeFailuresByIp.recordFailure(ip)
      codeFailuresByCpf.recordFailure(cpf)
      throw error
    }
  }

  await app.register(async (scope) => {
    scope.addHook('onRequest', async (request) => assertAllowedOrigin(request, env))
    scope.addHook('onSend', async (_request, reply) => {
      reply.header('Cache-Control', 'no-store')
    })

    scope.post(`${PREFIX}/identify`, async (request) => {
      limitIdentify(request.ip)
      const { cpf } = identifyInputSchema.parse(request.body)
      return accounts.identify(cpf)
    })

    scope.post(`${PREFIX}/codes`, async (request, reply) => {
      limitCodes(request.ip)
      await accounts.requestCode(requestCodeInputSchema.parse(request.body))
      return reply.status(202).send()
    })

    scope.post(`${PREFIX}/login`, async (request, reply) => {
      const input = loginInputSchema.parse(request.body)
      loginFailuresByIp.assertAllowed(request.ip)
      loginFailuresByCpf.assertAllowed(input.cpf)
      const { token, account } = await accounts
        .login(input.cpf, input.password)
        .catch((error: unknown) => {
          loginFailuresByIp.recordFailure(request.ip)
          loginFailuresByCpf.recordFailure(input.cpf)
          throw error
        })
      startSession(reply, token)
      return { account: accounts.toPublic(account) }
    })

    scope.post(`${PREFIX}/register`, async (request, reply) => {
      codeFailuresByIp.assertAllowed(request.ip)
      const input = registerInputSchema.parse(request.body)
      codeFailuresByCpf.assertAllowed(input.customer.cpf)
      const { token, account } = await accounts
        .register(input)
        .catch(recordCodeFailure(request.ip, input.customer.cpf))
      startSession(reply, token)
      return reply.status(201).send({ account: accounts.toPublic(account) })
    })

    scope.post(`${PREFIX}/password`, async (request, reply) => {
      codeFailuresByIp.assertAllowed(request.ip)
      const input = setPasswordInputSchema.parse(request.body)
      codeFailuresByCpf.assertAllowed(input.cpf)
      const { token, account } = await accounts
        .setPassword(input)
        .catch(recordCodeFailure(request.ip, input.cpf))
      startSession(reply, token)
      return { account: accounts.toPublic(account) }
    })

    scope.get(`${PREFIX}/me`, async (request) => {
      const session = requireCustomer(request, accounts)
      return { account: accounts.toPublic(session.account) }
    })

    scope.put(`${PREFIX}/profile`, async (request) => {
      const session = requireCustomer(request, accounts)
      const account = await accounts.updateProfile(
        session,
        updateProfileInputSchema.parse(request.body),
      )
      return { account: accounts.toPublic(account) }
    })

    scope.post(`${PREFIX}/logout`, async (request, reply) => {
      const session = accounts.authenticate(request.cookies[CUSTOMER_SESSION_COOKIE])
      if (session) accounts.logout(session)
      reply.clearCookie(CUSTOMER_SESSION_COOKIE, cookieOptions)
      return reply.status(204).send()
    })
  })
}
