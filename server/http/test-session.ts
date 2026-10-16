import type { FastifyInstance } from 'fastify'
import { CUSTOMER_SESSION_COOKIE } from './customer-session.js'

// Primeiro acesso da Maria do mock com o código fixo (só vale em modo totalmente mock).
export async function loginAsMaria(app: FastifyInstance): Promise<Record<string, string>> {
  await app.inject({
    method: 'POST',
    url: '/api/v1/account/codes',
    payload: { purpose: 'first_access', cpf: '52998224725' },
  })
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/account/password',
    payload: { cpf: '52998224725', code: '000000', password: 'senha-maria-1' },
  })
  const cookie = response.cookies.find((item) => item.name === CUSTOMER_SESSION_COOKIE)
  if (!cookie) throw new Error('sem cookie de sessão')
  return { [CUSTOMER_SESSION_COOKIE]: cookie.value }
}
