import type { Order } from '../domains/orders/order-types.js'
import { isNotValidated, refundDueInCents } from '../domains/orders/sales-deadline.js'

export function presentOrder(order: Order) {
  const refundDue = refundDueInCents(order)
  return {
    id: order.id,
    status: order.status,
    selectionMode: order.selectionMode,
    unitPriceInCents: order.unitPriceInCents,
    totalInCents: order.totalInCents,
    items: order.items.map((item) => ({
      id: item.id,
      code: item.code,
      numbers: item.numbers,
      secondChanceNumbers: item.secondChanceNumbers ?? [],
      raffleId: item.raffleId ?? order.raffleId,
      raffleTitle: item.raffleTitle ?? order.raffleTitle,
      unitPriceInCents: item.unitPriceInCents ?? order.unitPriceInCents,
      ...(item.salesEndAt ? { salesEndAt: item.salesEndAt } : {}),
      ...(isNotValidated(item) ? { validationStatus: 'not_validated' as const } : {}),
    })),
    ...(refundDue > 0 ? { refundDueInCents: refundDue } : {}),
    receiptUrl: order.receiptUrl,
    expiresAt: order.expiresAt,
    message: messageFor(order, refundDue),
  }
}

function messageFor(order: Order, refundDue: number) {
  if (order.status === 'manual_review') {
    return 'Pagamento recebido. Estamos confirmando seus bilhetes manualmente.'
  }
  if (order.status === 'not_validated') {
    return 'Pagamento recebido após o fim das vendas do concurso. Os bilhetes não foram validados e o valor será estornado.'
  }
  if (order.status === 'paid' && refundDue > 0) {
    return 'Parte do pagamento chegou após o fim das vendas de um concurso. Os bilhetes marcados como não validados não concorrem e o valor deles será estornado.'
  }
  return undefined
}

// Resumo para "Minhas compras". Só pedido pago traz dados pessoais e do comprovante; a rota exige
// a sessão do dono.
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
      if (!ticket || isNotValidated(ticket)) return item
      return {
        ...item,
        identification: ticket.identification,
        drawDate: ticket.drawDate,
        prizes: ticket.prizes,
        luckySpins: ticket.luckySpins,
        validationBatch: ticket.validationBatch,
        batchPosition: ticket.batchPosition,
      }
    }),
  }
}
