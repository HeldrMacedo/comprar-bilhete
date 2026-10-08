import type { Order } from '../domains/orders/order-types.js'

export function presentOrder(order: Order) {
  return {
    id: order.id,
    status: order.status,
    selectionMode: order.selectionMode,
    unitPriceInCents: order.unitPriceInCents,
    totalInCents: order.totalInCents,
    items: order.items.map(
      ({ id, code, numbers, secondChanceNumbers, raffleId, raffleTitle, unitPriceInCents }) => ({
        id,
        code,
        numbers,
        secondChanceNumbers: secondChanceNumbers ?? [],
        raffleId: raffleId ?? order.raffleId,
        raffleTitle: raffleTitle ?? order.raffleTitle,
        unitPriceInCents: unitPriceInCents ?? order.unitPriceInCents,
      }),
    ),
    receiptUrl: order.receiptUrl,
    expiresAt: order.expiresAt,
    message:
      order.status === 'manual_review'
        ? 'Pagamento recebido. Estamos confirmando seus bilhetes manualmente.'
        : undefined,
  }
}

// Resumo para "Minhas compras". Só pedido pago traz dados pessoais e do comprovante, porque a
// consulta é feita apenas pelo CPF (risco aceito, ver tech-debt-tracker).
export function presentPurchase(order: Order) {
  const summary = {
    ...presentOrder(order),
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    paymentMethod: order.captureMethod,
    checkoutUrl: order.status === 'pending' ? order.checkoutUrl : undefined,
  }
  if (order.status !== 'paid') return summary

  return {
    ...summary,
    customer: {
      name: order.customer.beneficiaryName ?? order.customer.name,
      city: order.customer.address?.city,
      phone: order.customer.phone,
      cpf: order.customer.cpf,
    },
    items: summary.items.map((item, index) => {
      const ticket = order.items[index]
      return {
        ...item,
        identification: ticket?.identification,
        drawDate: ticket?.drawDate,
        prizes: ticket?.prizes,
        luckySpins: ticket?.luckySpins,
        validationBatch: ticket?.validationBatch,
        batchPosition: ticket?.batchPosition,
      }
    }),
  }
}
