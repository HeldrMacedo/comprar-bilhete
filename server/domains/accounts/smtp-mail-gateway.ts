import nodemailer, { type Transporter } from 'nodemailer'
import { z } from 'zod'
import type { ServerEnv } from '../../config/env.js'
import { DomainError } from '../../shared/errors.js'
import {
  MailDeliveryError,
  verificationEmailText,
  type MailGateway,
  type MailMessage,
} from './mail-gateway.js'

export type MailErrorLogger = { error(details: object, message: string): void }

// Só os campos técnicos do nodemailer: mensagem e resposta do servidor podem conter o código
// ou o destinatário.
const smtpErrorSchema = z.object({
  code: z.string().optional().catch(undefined),
  responseCode: z.number().optional().catch(undefined),
  command: z.string().optional().catch(undefined),
})

export class SmtpMailGateway implements MailGateway {
  private readonly transporter: Transporter
  private readonly from: string

  constructor(
    env: ServerEnv,
    private readonly log: MailErrorLogger,
  ) {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      // Sem limite, um SMTP travado prende a requisição do cliente indefinidamente.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
    this.from = env.MAIL_FROM ?? ''
  }

  async sendVerificationCode(to: string, code: string) {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Seu código de acesso Sol da Sorte',
        text: verificationEmailText(code),
      })
    } catch (error) {
      const details = smtpErrorSchema.safeParse(error)
      this.log.error(details.success ? details.data : {}, 'Falha ao enviar e-mail de verificação')
      throw new DomainError(
        'Não foi possível enviar o e-mail agora. Tente novamente em instantes.',
        503,
        'MAIL_UNAVAILABLE',
      )
    }
  }

  async send(message: MailMessage) {
    try {
      await this.transporter.sendMail({ from: this.from, ...message })
    } catch (error) {
      const parsed = smtpErrorSchema.safeParse(error)
      const details = parsed.success ? parsed.data : {}
      this.log.error(details, 'Falha ao enviar e-mail dos bilhetes')
      throw new MailDeliveryError(details)
    }
  }
}
