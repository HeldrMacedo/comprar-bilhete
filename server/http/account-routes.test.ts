import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { parseServerEnv } from '../config/env.js'
import { MockMailGateway } from '../domains/accounts/mock-mail-gateway.js'
import { MockCustomerGateway } from '../domains/customers/mock-customer-gateway.js'
import { MockTicketGateway } from '../domains/tickets/mock-ticket-gateway.js'
import { loginAsMaria } from './test-session.js'

const env = parseServerEnv({
  DATABASE_PATH: ':memory:',
  TICKET_PROVIDER: 'mock',
  PAYMENT_PROVIDER: 'mock',
})
const apps: Awaited<ReturnType<typeof buildApp>>[] = []
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

async function createApp(now?: () => Date) {
  const app = await buildApp({ env, logger: false, startWorker: false, ...(now ? { now } : {}) })
  apps.push(app)
  return app
}

describe('rotas de conta', () => {
  it('identifica CPF sem revelar dados além do e-mail mascarado', async () => {
    const app = await createApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/account/identify',
      payload: { cpf: '52998224725' },
    })
    expect(response.json()).toEqual({ status: 'first_access', maskedEmail: 'ma***@example.com' })
    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('primeiro acesso cria sessão em cookie HttpOnly e /me devolve a conta', async () => {
    const app = await createApp()
    const cookies = await loginAsMaria(app)
    const me = await app.inject({ method: 'GET', url: '/api/v1/account/me', cookies })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({
      account: { cpf: '52998224725', name: 'Maria da Silva', complete: true },
    })
    expect(me.json().account).not.toHaveProperty('externalId')
  })

  it('cookie de sessão é HttpOnly e SameSite=Strict', async () => {
    const app = await createApp()
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
    const cookie = response.cookies.find((item) => item.name === 'customer_session')
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api' })
  })

  it('login errado responde 401 genérico e trava após 5 falhas do mesmo CPF', async () => {
    const app = await createApp()
    await loginAsMaria(app)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/account/login',
        payload: { cpf: '52998224725', password: 'errada-123' },
      })
      expect(response.statusCode).toBe(401)
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/v1/account/login',
      payload: { cpf: '52998224725', password: 'senha-maria-1' },
    })
    expect(blocked.statusCode).toBe(429)
  })

  it('trava /password após 10 códigos errados do mesmo CPF, mesmo vindo de IPs diferentes', async () => {
    let clock = new Date('2026-10-16T12:00:00.000Z')
    const app = await createApp(() => clock)
    await app.inject({
      method: 'POST',
      url: '/api/v1/account/codes',
      payload: { purpose: 'first_access', cpf: '52998224725' },
    })
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/account/password',
        remoteAddress: `10.0.0.${attempt + 1}`,
        payload: { cpf: '52998224725', code: '111111', password: 'senha-maria-1' },
      })
      expect(response.statusCode).toBe(400)
    }

    // Código novo e válido: só o limite por CPF explica a recusa.
    clock = new Date(clock.getTime() + 61_000)
    const code = await app.inject({
      method: 'POST',
      url: '/api/v1/account/codes',
      payload: { purpose: 'first_access', cpf: '52998224725' },
    })
    expect(code.statusCode).toBe(202)
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/v1/account/password',
      remoteAddress: '10.0.1.1',
      payload: { cpf: '52998224725', code: '000000', password: 'senha-maria-1' },
    })
    expect(blocked.statusCode).toBe(429)
  })

  it('cadastro novo entra direto, sem código de e-mail', async () => {
    const app = await createApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/account/register',
      payload: {
        customer: {
          name: 'Cliente Novo',
          cpf: '11144477735',
          phone: '84999998888',
          email: 'novo@example.com',
          address: {
            zipCode: '59000000',
            street: 'RUA A',
            number: '10',
            neighborhood: 'CENTRO',
            city: 'NATAL',
            state: 'RN',
          },
        },
        password: 'senha-nova-1',
      },
    })
    expect(response.statusCode).toBe(201)
    const cookie = response.cookies.find((item) => item.name === 'customer_session')
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict' })
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/account/me',
      cookies: { customer_session: cookie?.value ?? '' },
    })
    expect(me.json()).toMatchObject({ account: { cpf: '11144477735', complete: true } })
  })

  it('cadastro sem e-mail e sem CEP fica completo, mas o endereço continua obrigatório', async () => {
    const app = await createApp()
    const customer = {
      name: 'Cliente Sem Email',
      cpf: '11144477735',
      phone: '84999998888',
      address: {
        street: 'RUA A',
        number: '10',
        neighborhood: 'CENTRO',
        city: 'NATAL',
        state: 'RN',
      },
    }
    const register = (payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: '/api/v1/account/register', payload })

    const withoutStreet = await register({
      customer: { ...customer, address: { ...customer.address, street: '' } },
      password: 'senha-nova-1',
    })
    expect(withoutStreet.statusCode).toBe(400)

    const response = await register({ customer, password: 'senha-nova-1' })
    expect(response.statusCode).toBe(201)
    const { account } = response.json<{ account: { address: Record<string, unknown> } }>()
    expect(account).toMatchObject({ email: null, complete: true })
    expect(account.address).not.toHaveProperty('zipCode')
  })

  it('cadastro de CPF já na API responde 409 até o limite por IP', async () => {
    const app = await createApp()
    const maria = {
      name: 'Maria da Silva',
      cpf: '52998224725',
      phone: '84999855367',
      email: 'maria@example.com',
      address: {
        zipCode: '59000000',
        street: 'RUA A',
        number: '10',
        neighborhood: 'CENTRO',
        city: 'NATAL',
        state: 'RN',
      },
    }
    const register = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/account/register',
        payload: { customer: maria, password: 'senha-maria-1' },
      })
    // Padrão de ACCOUNT_CODE_LIMIT_PER_MINUTE: 5 cadastros por minuto por IP.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await register()
      expect(response.statusCode).toBe(409)
      expect(response.json()).toMatchObject({ code: 'ACCOUNT_EXISTS' })
    }
    expect((await register()).statusCode).toBe(429)
  })

  it('pedido de código repassa erro de domínio em vez de 202', async () => {
    const app = await createApp()
    await loginAsMaria(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/account/codes',
      payload: { purpose: 'first_access', cpf: '52998224725' },
    })
    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ code: 'ACCOUNT_EXISTS' })
  })

  it('com provider real e e-mail mock, o código não é o fixo de testes', async () => {
    const mail = new MockMailGateway()
    const tickets = new MockTicketGateway()
    let clock = new Date('2026-10-16T12:00:00.000Z')
    const app = await buildApp({
      env: parseServerEnv({
        DATABASE_PATH: ':memory:',
        TICKET_PROVIDER: 'live',
        PAYMENT_PROVIDER: 'mock',
        MAIL_PROVIDER: 'mock',
      }),
      logger: false,
      startWorker: false,
      tickets,
      contestAdmin: tickets,
      customers: new MockCustomerGateway(),
      mail,
      now: () => clock,
    })
    apps.push(app)
    // Dois pedidos: o código fixo repetiria 000000 nos dois; aleatórios quase nunca.
    for (let request = 0; request < 2; request += 1) {
      const codeResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/account/codes',
        payload: { purpose: 'first_access', cpf: '52998224725' },
      })
      expect(codeResponse.statusCode).toBe(202)
      clock = new Date(clock.getTime() + 61_000)
    }
    const codes = mail.sent.map((item) => item.code)
    expect(codes).toHaveLength(2)
    expect(codes.every((code) => code === '000000')).toBe(false)
    const sent = codes[1]
    if (!sent) throw new Error('nenhum código enviado')

    // Chance de 1 em 1 milhão de o código aleatório coincidir com o fixo.
    if (sent !== '000000') {
      const fixed = await app.inject({
        method: 'POST',
        url: '/api/v1/account/password',
        payload: { cpf: '52998224725', code: '000000', password: 'senha-maria-1' },
      })
      expect(fixed.statusCode).toBe(400)
    }
    const valid = await app.inject({
      method: 'POST',
      url: '/api/v1/account/password',
      payload: { cpf: '52998224725', code: sent, password: 'senha-maria-1' },
    })
    expect(valid.statusCode).toBe(200)
  })

  it('com TRUST_PROXY, cada IP de X-Forwarded-For tem o próprio limite de identify', async () => {
    async function identifyFrom(app: Awaited<ReturnType<typeof buildApp>>, ip: string) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/account/identify',
        headers: { 'x-forwarded-for': ip },
        payload: { cpf: '52998224725' },
      })
      return response.statusCode
    }
    async function appWith(trustProxy: string | undefined) {
      const app = await buildApp({
        env: parseServerEnv({
          DATABASE_PATH: ':memory:',
          ACCOUNT_IDENTIFY_LIMIT_PER_MINUTE: '1',
          ...(trustProxy ? { TRUST_PROXY: trustProxy } : {}),
        }),
        logger: false,
        startWorker: false,
      })
      apps.push(app)
      return app
    }

    const behindProxy = await appWith('true')
    expect(await identifyFrom(behindProxy, '203.0.113.1')).toBe(200)
    expect(await identifyFrom(behindProxy, '203.0.113.2')).toBe(200)
    expect(await identifyFrom(behindProxy, '203.0.113.1')).toBe(429)

    // Sem TRUST_PROXY o cabeçalho é ignorado: todos dividem o IP do proxy.
    const direct = await appWith(undefined)
    expect(await identifyFrom(direct, '203.0.113.1')).toBe(200)
    expect(await identifyFrom(direct, '203.0.113.2')).toBe(429)
  })

  it('recusa escrita de outra origem', async () => {
    const app = await createApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/account/identify',
      headers: { origin: 'https://malicioso.example' },
      payload: { cpf: '52998224725' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('aceita escrita de origem listada em ALLOWED_ORIGINS', async () => {
    const app = await buildApp({
      env: parseServerEnv({
        DATABASE_PATH: ':memory:',
        TICKET_PROVIDER: 'mock',
        PAYMENT_PROVIDER: 'mock',
        ALLOWED_ORIGINS: 'http://localhost:5173',
        PUBLIC_APP_URL: 'http://app.example',
      }),
      logger: false,
      startWorker: false,
    })
    apps.push(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/account/identify',
      headers: { origin: 'http://localhost:5173' },
      payload: { cpf: '52998224725' },
    })
    expect(response.statusCode).toBe(200)
  })

  it('logout apaga a sessão', async () => {
    const app = await createApp()
    const cookies = await loginAsMaria(app)
    await app.inject({ method: 'POST', url: '/api/v1/account/logout', cookies })
    const me = await app.inject({ method: 'GET', url: '/api/v1/account/me', cookies })
    expect(me.statusCode).toBe(401)
  })
})
