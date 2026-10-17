import type { MailGateway, MailMessage } from './mail-gateway.js'

// Guarda os envios em memória para testes; nada sai do processo.
export class MockMailGateway implements MailGateway {
  readonly sent: Array<{ to: string; code: string }> = []
  readonly messages: MailMessage[] = []

  async sendVerificationCode(to: string, code: string) {
    this.sent.push({ to, code })
  }

  async send(message: MailMessage) {
    this.messages.push(message)
  }
}
