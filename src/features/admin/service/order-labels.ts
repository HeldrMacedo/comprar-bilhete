import type { AdminOrder, EmailStatus, OrderStatus } from '../domain/types'

export const orderStatusLabels: Record<OrderStatus, string> = {
  pending: 'Pendente',
  processing: 'Processando',
  paid: 'Pago',
  expired: 'Expirado',
  cancelled: 'Cancelado',
  manual_review: 'Em análise',
  not_validated: 'Não validado',
}

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

// "Em análise" nunca usa o tom de sucesso: dinheiro recebido, entrega pendente.
export const orderStatusTones: Record<OrderStatus, BadgeTone> = {
  pending: 'warning',
  processing: 'info',
  paid: 'success',
  expired: 'neutral',
  cancelled: 'neutral',
  manual_review: 'danger',
  not_validated: 'warning',
}

export function canApprove(order: AdminOrder) {
  return order.status === 'pending' || order.status === 'manual_review'
}

export function canCancel(order: AdminOrder) {
  return order.status === 'pending' || order.status === 'manual_review'
}

export function describeCaptureMethod(method: string | undefined) {
  if (!method) return '—'
  if (method === 'manual') return 'Baixa manual'
  if (method === 'pix') return 'Pix'
  if (method === 'credit_card') return 'Cartão de crédito'
  return method
}

export const emailStatusLabels: Record<EmailStatus, string> = {
  pending: 'Na fila',
  sent: 'Enviado',
  failed: 'Falhou',
  no_recipient: 'Sem e-mail',
}

export const emailStatusTones: Record<EmailStatus, BadgeTone> = {
  pending: 'info',
  sent: 'success',
  failed: 'danger',
  no_recipient: 'neutral',
}

// Pedido pago antes da fila existir não tem status e também pode receber o e-mail.
export function canResendEmail(order: AdminOrder) {
  return (
    order.status === 'paid' &&
    order.emailStatus !== 'pending' &&
    order.emailStatus !== 'no_recipient'
  )
}
