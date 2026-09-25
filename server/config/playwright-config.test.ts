import { expect, it } from 'vitest'
import config from '../../playwright.config.js'

it('isola a jornada E2E de um backend live já em execução', () => {
  expect(config.use?.baseURL).toBe('http://127.0.0.1:4173')
  expect(config.webServer).toMatchObject([
    {
      url: 'http://127.0.0.1:3334/api/health',
      reuseExistingServer: false,
      env: {
        SERVER_PORT: '3334',
        DATABASE_PATH: ':memory:',
        TICKET_PROVIDER: 'mock',
        PAYMENT_PROVIDER: 'mock',
        PUBLIC_APP_URL: 'http://127.0.0.1:4173',
        PUBLIC_API_URL: 'http://127.0.0.1:3334',
      },
    },
    {
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      env: {
        VITE_API_MODE: 'live',
        VITE_API_PROXY_TARGET: 'http://127.0.0.1:3334',
      },
    },
  ])
})
