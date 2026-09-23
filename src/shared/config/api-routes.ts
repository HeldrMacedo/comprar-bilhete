export const apiRoutes = {
  customerLookup(criteria: { cpf?: string; phone?: string }) {
    const query = new URLSearchParams()
    if (criteria.cpf) query.set('cpf', criteria.cpf)
    if (criteria.phone) query.set('phone', criteria.phone)
    return `/v1/customers/lookup?${query.toString()}`
  },
  activeRaffle: '/v1/raffles/active',
  availableCards: (raffleId: string) =>
    `/v1/raffles/${encodeURIComponent(raffleId)}/cards?status=available`,
  createOrder: '/v1/orders',
  createCheckout: (orderId: string) => `/v1/orders/${encodeURIComponent(orderId)}/checkout`,
  order: (orderId: string, paymentReference?: { transactionNsu: string; slug: string }) => {
    const path = `/v1/orders/${encodeURIComponent(orderId)}`
    if (!paymentReference) return path
    const query = new URLSearchParams({
      transaction_nsu: paymentReference.transactionNsu,
      slug: paymentReference.slug,
    })
    return `${path}?${query.toString()}`
  },
} as const
