import type { Order } from '../domains/orders/order-types.js'

export function presentOrder(order: Order) {
  return {
    id: order.id,
    status: order.status,
    totalInCents: order.totalInCents,
    receiptUrl: order.receiptUrl,
    expiresAt: order.expiresAt,
    message:
      order.status === 'manual_review'
        ? 'Pagamento recebido. Estamos confirmando suas cartelas manualmente.'
        : undefined,
  }
}
