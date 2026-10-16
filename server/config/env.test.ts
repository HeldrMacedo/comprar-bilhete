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

it('mantém a reserva externa desligada por padrão', () => {
  const env = parseServerEnv({})
  expect(env.TICKET_RESERVATION_PROVIDER).toBe('none')
  expect(env.TICKET_RESERVATION_TTL_MINUTES).toBe(30)
})

it('exige TICKET_PROVIDER=live para a reserva externa live', () => {
  expect(() => parseServerEnv({ TICKET_RESERVATION_PROVIDER: 'live' })).toThrow()
  expect(
    parseServerEnv({ TICKET_PROVIDER: 'live', TICKET_RESERVATION_PROVIDER: 'live' })
      .TICKET_RESERVATION_PROVIDER,
  ).toBe('live')
})

it('exige prazo da reserva externa maior que a expiração do pedido', () => {
  expect(() =>
    parseServerEnv({
      TICKET_RESERVATION_PROVIDER: 'mock',
      ORDER_EXPIRATION_MINUTES: '15',
      TICKET_RESERVATION_TTL_MINUTES: '15',
    }),
  ).toThrow()
})

it('usa e-mail mock por padrão', () => {
  expect(parseServerEnv({}).MAIL_PROVIDER).toBe('mock')
})

it('exige configuração SMTP completa com MAIL_PROVIDER=smtp', () => {
  expect(() => parseServerEnv({ MAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example.com' })).toThrow(
    /SMTP_USER/,
  )
})

it('aceita SMTP completo', () => {
  const env = parseServerEnv({
    MAIL_PROVIDER: 'smtp',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'user',
    SMTP_PASS: 'pass',
    MAIL_FROM: 'Sol da Sorte <nao-responda@example.com>',
  })
  expect(env.SMTP_PORT).toBe(587)
  expect(env.SMTP_SECURE).toBe(false)
})
