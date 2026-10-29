import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { parseServerEnv } from '../config/env.js'

const apps: Awaited<ReturnType<typeof buildApp>>[] = []
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

async function createApp(overrides: Record<string, string> = {}) {
  const env = parseServerEnv({
    DATABASE_PATH: ':memory:',
    TICKET_PROVIDER: 'mock',
    PAYMENT_PROVIDER: 'mock',
    ...overrides,
  })
  const app = await buildApp({ env, logger: false, startWorker: false })
  apps.push(app)
  return app
}

describe('rota de CEP', () => {
  it('devolve o endereço do CEP', async () => {
    const app = await createApp()
    const response = await app.inject({ method: 'GET', url: '/api/v1/zip-codes/59062300' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      address: {
        zipCode: '59062300',
        street: 'Avenida Lima e Silva',
        neighborhood: 'Nossa Senhora de Nazaré',
        city: 'Natal',
        state: 'RN',
      },
    })
  })

  it('responde 404 ZIP_CODE_NOT_FOUND para CEP desconhecido', async () => {
    const app = await createApp()
    const response = await app.inject({ method: 'GET', url: '/api/v1/zip-codes/00000000' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'ZIP_CODE_NOT_FOUND' })
  })

  it('recusa CEP fora do formato de 8 dígitos', async () => {
    const app = await createApp()
    const response = await app.inject({ method: 'GET', url: '/api/v1/zip-codes/5906-300' })

    expect(response.statusCode).toBe(400)
  })

  it('limita as consultas por IP', async () => {
    const app = await createApp({ ZIP_CODE_LIMIT_PER_MINUTE: '1' })
    await app.inject({ method: 'GET', url: '/api/v1/zip-codes/59062300' })
    const response = await app.inject({ method: 'GET', url: '/api/v1/zip-codes/59062300' })

    expect(response.statusCode).toBe(429)
  })
})
