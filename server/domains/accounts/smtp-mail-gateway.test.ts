import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseServerEnv } from '../../config/env.js'
import { SmtpMailGateway } from './smtp-mail-gateway.js'

const { createTransport, sendMail } = vi.hoisted(() => {
  const sendMail = vi.fn()
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) }
})

vi.mock('nodemailer', () => ({ default: { createTransport } }))

const env = parseServerEnv({
  MAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_USER: 'user',
  SMTP_PASS: 'pass',
  MAIL_FROM: 'Sol da Sorte <nao-responda@example.com>',
})

describe('SmtpMailGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('limita o tempo de conexão e de resposta do SMTP', () => {
    new SmtpMailGateway(env, { error: vi.fn() })
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      }),
    )
  })

  it('registra só os dados técnicos da falha e responde 503', async () => {
    const error = Object.assign(new Error('Mensagem com 123456 para maria@example.com'), {
      code: 'EAUTH',
      responseCode: 535,
      command: 'AUTH PLAIN',
      response: '535 falhou 123456',
    })
    sendMail.mockRejectedValue(error)
    const log = { error: vi.fn() }
    const gateway = new SmtpMailGateway(env, log)

    await expect(gateway.sendVerificationCode('maria@example.com', '123456')).rejects.toMatchObject(
      { statusCode: 503, code: 'MAIL_UNAVAILABLE' },
    )

    expect(log.error).toHaveBeenCalledWith(
      { code: 'EAUTH', responseCode: 535, command: 'AUTH PLAIN' },
      'Falha ao enviar e-mail de verificação',
    )
    const logged = JSON.stringify(log.error.mock.calls)
    expect(logged).not.toContain('123456')
    expect(logged).not.toContain('maria@example.com')
  })

  it('não quebra o registro quando o erro não tem dados do SMTP', async () => {
    sendMail.mockRejectedValue('falha sem objeto')
    const log = { error: vi.fn() }
    const gateway = new SmtpMailGateway(env, log)

    await expect(gateway.sendVerificationCode('maria@example.com', '123456')).rejects.toMatchObject(
      { code: 'MAIL_UNAVAILABLE' },
    )
    expect(log.error).toHaveBeenCalledWith({}, 'Falha ao enviar e-mail de verificação')
  })
})
