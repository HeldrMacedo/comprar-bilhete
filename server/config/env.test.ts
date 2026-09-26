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

it('mantém compra por HTTP desabilitada por padrão', () => {
  expect(parseServerEnv({}).TICKET_API_ALLOW_HTTP).toBe(false)
  expect(parseServerEnv({ TICKET_API_ALLOW_HTTP: 'true' }).TICKET_API_ALLOW_HTTP).toBe(true)
  expect(() => parseServerEnv({ TICKET_API_ALLOW_HTTP: 'sim' })).toThrow()
})
