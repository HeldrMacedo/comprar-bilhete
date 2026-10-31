import type { Order, Ticket } from './order-types.js'

// Mesma chave das reservas locais: um pedido agrupado pode ter o mesmo número nos dois concursos.
export function ticketKey(order: Pick<Order, 'raffleId'>, item: Ticket) {
  return `${item.raffleId ?? order.raffleId}:${item.id}`
}

export function isNotValidated(item: Ticket) {
  return item.validationStatus === 'not_validated'
}

export function validatedItems(order: Order) {
  return order.items.filter((item) => !isNotValidated(item))
}

// Bilhete sem fim de vendas (pedido antigo ou concurso mock) não é checado.
export function lateTicketKeys(order: Order, receivedAt: string) {
  const received = Date.parse(receivedAt)
  return order.items
    .filter((item) => item.salesEndAt !== undefined && received >= Date.parse(item.salesEndAt))
    .map((item) => ticketKey(order, item))
}

export function refundDueInCents(order: Order) {
  return order.items
    .filter(isNotValidated)
    .reduce((sum, item) => sum + (item.unitPriceInCents ?? order.unitPriceInCents), 0)
}

// Estorno pelo prazo só vale em pedido pago ou não validado: em análise ainda aguarda decisão do
// admin, e cancelado é estornado por inteiro fora do sistema.
export function pendingRefundInCents(order: Order) {
  return order.status === 'paid' || order.status === 'not_validated' ? refundDueInCents(order) : 0
}
