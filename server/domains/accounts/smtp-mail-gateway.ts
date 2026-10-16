import nodemailer, { type Transporter } from 'nodemailer'
import type { ServerEnv } from '../../config/env.js'
import { DomainError } from '../../shared/errors.js'
import { verificationEmailText, type MailGateway } from './mail-gateway.js'

export class SmtpMailGateway implements MailGateway {
  private readonly transporter: Transporter
  private readonly from: string

  constructor(env: ServerEnv) {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
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
    } catch {
      // O erro do SMTP pode conter o corpo da mensagem; não é repassado para não vazar o código.
      throw new DomainError(
        'Não foi possível enviar o e-mail agora. Tente novamente em instantes.',
        503,
        'MAIL_UNAVAILABLE',
      )
    }
  }
}
