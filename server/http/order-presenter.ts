import type { Order } from '../domains/orders/order-types.js'

export function presentOrder(order: Order) {
  return {
    id: order.id,
    status: order.status,
    selectionMode: order.selectionMode,
    unitPriceInCents: order.unitPriceInCents,
    totalInCents: order.totalInCents,
    items: order.items.map(({ id, code, numbers, raffleId, raffleTitle, unitPriceInCents }) => ({
      id,
      code,
      numbers,
      raffleId: raffleId ?? order.raffleId,
      raffleTitle: raffleTitle ?? order.raffleTitle,
      unitPriceInCents: unitPriceInCents ?? order.unitPriceInCents,
    })),
    receiptUrl: order.receiptUrl,
    expiresAt: order.expiresAt,
    message:
      order.status === 'manual_review'
        ? 'Pagamento recebido. Estamos confirmando suas cartelas manualmente.'
        : undefined,
  }
}
