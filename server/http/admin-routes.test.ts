import { afterAll, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { parseServerEnv } from '../config/env.js'
import { ADMIN_SESSION_COOKIE } from './admin-routes.js'

const PASSWORD = 'senha-segura-123'
const ORIGIN = 'http://localhost:5173'

const app = await buildApp({
  env: parseServerEnv({
    DATABASE_PATH: ':memory:',
    TICKET_PROVIDER: 'mock',
    PAYMENT_PROVIDER: 'mock',
    PUBLIC_APP_URL: ORIGIN,
    ADMIN_BOOTSTRAP_LOGIN: 'admin',
    ADMIN_BOOTSTRAP_PASSWORD: PASSWORD,
  }),
  logger: false,
  startWorker: false,
})

afterAll(async () => {
  await app.close()
})

async function login(loginName = 'admin', password = PASSWORD) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/session',
    headers: { origin: ORIGIN },
    payload: { login: loginName, password },
  })
  const cookie = response.cookies.find(({ name }) => name === ADMIN_SESSION_COOKIE)
  return { response, cookie: cookie ? `${ADMIN_SESSION_COOKIE}=${cookie.value}` : '' }
}

describe('admin session', () => {
  it('sets an httpOnly strict cookie scoped to the admin API on login', async () => {
    const { response } = await login()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ user: expect.objectContaining({ login: 'admin' }) })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.cookies).toEqual([
      expect.objectContaining({
        name: ADMIN_SESSION_COOKIE,
        httpOnly: true,
        sameSite: 'Strict',
        path: '/api/v1/admin',
      }),
    ])
  })

  it('rejects invalid credentials without a cookie', async () => {
    const { response, cookie } = await login('admin', 'senha-errada-000')

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'ADMIN_INVALID_CREDENTIALS' })
    expect(cookie).toBe('')
  })

  it('limits failed logins per IP without counting successful ones', async () => {
    const limited = await buildApp({
      env: parseServerEnv({
        DATABASE_PATH: ':memory:',
        PUBLIC_APP_URL: ORIGIN,
        ADMIN_BOOTSTRAP_LOGIN: 'admin',
        ADMIN_BOOTSTRAP_PASSWORD: PASSWORD,
      }),
      logger: false,
      startWorker: false,
    })
    const attempt = (password: string) =>
      limited.inject({
        method: 'POST',
        url: '/api/v1/admin/session',
        payload: { login: 'admin', password },
      })

    for (let index = 0; index < 12; index += 1) {
      expect((await attempt(PASSWORD)).statusCode).toBe(200)
    }
    for (let index = 0; index < 10; index += 1) {
      expect((await attempt('senha-errada-000')).statusCode).toBe(401)
    }
    const blocked = await attempt(PASSWORD)
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json()).toMatchObject({
      message: 'Muitas tentativas de login. Aguarde um minuto e tente novamente.',
    })
    await limited.close()
  })

  it('rejects writes from another origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/session',
      headers: { origin: 'https://evil.example' },
      payload: { login: 'admin', password: PASSWORD },
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns the current user and ends the session on logout', async () => {
    const { cookie } = await login()

    const current = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/session',
      headers: { cookie },
    })
    expect(current.json()).toEqual({ user: expect.objectContaining({ login: 'admin' }) })

    const logout = await app.inject({
      method: 'DELETE',
      url: '/api/v1/admin/session',
      headers: { cookie, origin: ORIGIN },
    })
    expect(logout.statusCode).toBe(204)

    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: { cookie },
    })
    expect(after.statusCode).toBe(401)
  })
})

describe('admin users', () => {
  it('requires a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/admin/users' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'ADMIN_UNAUTHENTICATED' })
  })

  it('creates, updates and deletes a user without exposing password hashes', async () => {
    const { cookie } = await login()
    const headers = { cookie, origin: ORIGIN }

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers,
      payload: { login: 'Maria', name: 'Maria', password: PASSWORD },
    })
    expect(created.statusCode).toBe(201)
    const { user } = created.json<{ user: { id: string; login: string } }>()
    expect(user.login).toBe('maria')
    expect(created.body).not.toContain('scrypt')

    const short = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${user.id}`,
      headers,
      payload: { password: 'curta' },
    })
    expect(short.statusCode).toBe(400)

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${user.id}`,
      headers,
      payload: { name: 'Maria Souza' },
    })
    expect(renamed.json()).toMatchObject({ user: { name: 'Maria Souza' } })

    const list = await app.inject({ method: 'GET', url: '/api/v1/admin/users', headers })
    expect(list.body).not.toContain('password')

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/users/${user.id}`,
      headers,
    })
    expect(removed.statusCode).toBe(204)
  })
})
