import type { PurchaseStatus } from '../domain/types'

type StatusTone = 'success' | 'waiting' | 'warning' | 'muted'

// `manual_review` é dinheiro recebido com entrega pendente: nunca exibir como sucesso.
const statusLabels: Record<PurchaseStatus, { label: string; tone: StatusTone }> = {
  pending: { label: 'Aguardando pagamento', tone: 'waiting' },
  processing: { label: 'Confirmando bilhetes', tone: 'waiting' },
  paid: { label: 'Pago', tone: 'success' },
  manual_review: { label: 'Em análise', tone: 'warning' },
  expired: { label: 'Expirado', tone: 'muted' },
  cancelled: { label: 'Cancelado', tone: 'muted' },
}

const paymentMethodLabels: Record<string, string> = {
  pix: 'Pix',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
}

export function describeStatus(status: PurchaseStatus) {
  return statusLabels[status]
}

export function describePaymentMethod(method: string | undefined) {
  if (!method || method === 'unknown') return 'Não informado'
  return paymentMethodLabels[method] ?? method
}
