import type { AdminOrder, OrderStatus } from '../domain/types'

export const orderStatusLabels: Record<OrderStatus, string> = {
  pending: 'Pendente',
  processing: 'Processando',
  paid: 'Pago',
  expired: 'Expirado',
  cancelled: 'Cancelado',
  manual_review: 'Em análise',
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
