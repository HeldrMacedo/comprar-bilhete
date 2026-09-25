import { expect, it } from 'vitest'
import { parseServerEnv } from './env.js'

it('permite iniciar leitura live com a API de bilhetes HTTP', () => {
  expect(
    parseServerEnv({
      TICKET_PROVIDER: 'live',
      TICKET_API_BASE_URL: 'http://66.94.99.64:9090',
    }).TICKET_API_BASE_URL,
  ).toBe('http://66.94.99.64:9090')
})
