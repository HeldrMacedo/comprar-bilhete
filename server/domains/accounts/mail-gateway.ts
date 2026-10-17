export type MailAttachment = { filename: string; content: Buffer; contentType: string }

export type MailMessage = {
  to: string
  subject: string
  html: string
  text: string
  attachments?: MailAttachment[]
}

export type MailFailureDetails = { code?: string; responseCode?: number; command?: string }

// Falha de envio sem destinatário nem conteúdo: só os campos técnicos do SMTP.
export class MailDeliveryError extends Error {
  constructor(readonly details: MailFailureDetails) {
    super('Falha ao enviar e-mail.')
  }

  get summary() {
    return (
      Object.entries(this.details)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(' ') || 'falha sem detalhes do SMTP'
    )
  }
}

export interface MailGateway {
  sendVerificationCode(to: string, code: string): Promise<void>
  send(message: MailMessage): Promise<void>
}

export function verificationEmailText(code: string) {
  return [
    `Seu código de acesso à Sol da Sorte é ${code}.`,
    'Ele vale por 15 minutos.',
    'Ninguém da Sol da Sorte pede este código. Se você não pediu, ignore este e-mail.',
  ].join('\n\n')
}
