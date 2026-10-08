import type { Order } from '../domains/orders/order-types.js'

// Visão administrativa: inclui dados pessoais completos; servida só com sessão de admin.
export function presentAdminOrder(order: Order) {
  return {
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    totalInCents: order.totalInCents,
    paidAmountInCents: order.paidAmountInCents,
    captureMethod: order.captureMethod,
    lastError: order.lastError,
    customer: {
      name: order.customer.name,
      cpf: order.customer.cpf,
      phone: order.customer.phone,
      beneficiaryName: order.customer.beneficiaryName,
    },
    items: order.items.map((item) => ({
      id: item.id,
      code: item.code,
      raffleId: item.raffleId ?? order.raffleId,
      raffleTitle: item.raffleTitle ?? order.raffleTitle,
      unitPriceInCents: item.unitPriceInCents ?? order.unitPriceInCents,
    })),
  }
}
