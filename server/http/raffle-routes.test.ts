import { afterEach, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { parseServerEnv } from '../config/env.js'

const app = await buildApp({
  env: parseServerEnv({
    DATABASE_PATH: ':memory:',
    TICKET_PROVIDER: 'mock',
    PAYMENT_PROVIDER: 'mock',
  }),
  logger: false,
  startWorker: false,
})

afterEach(async () => {
  await app.close()
})

it('lists both available raffle choices with their own dates and prices', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/v1/raffles/active' })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual([
    expect.objectContaining({ id: 'sorteio-setembro', priceInCents: 1000 }),
    expect.objectContaining({ id: 'sorteio-domingo', priceInCents: 600 }),
  ])
})
