export interface MailGateway {
  sendVerificationCode(to: string, code: string): Promise<void>
}

export function verificationEmailText(code: string) {
  return [
    `Seu código de acesso à Sol da Sorte é ${code}.`,
    'Ele vale por 15 minutos.',
    'Ninguém da Sol da Sorte pede este código. Se você não pediu, ignore este e-mail.',
  ].join('\n\n')
}
