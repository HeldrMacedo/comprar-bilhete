export const apiRoutes = {
  customerLookup(criteria: { cpf: string }) {
    const query = new URLSearchParams({ cpf: criteria.cpf })
    return `/v1/customers/lookup?${query.toString()}`
  },
  activeRaffle: '/v1/raffles/active',
  availableCards: (raffleId: string) =>
    `/v1/raffles/${encodeURIComponent(raffleId)}/cards?status=available`,
  createOrder: '/v1/orders',
  purchaseLookup: '/v1/orders/lookup',
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
  adminSession: '/v1/admin/session',
  adminUsers: '/v1/admin/users',
  adminDashboard: '/v1/admin/dashboard',
  adminRaffles: '/v1/admin/raffles',
  adminRaffle: (source: string) => `/v1/admin/raffles/${encodeURIComponent(source)}`,
  adminSettings: '/v1/admin/settings',
  siteSettings: '/v1/site-settings',
  adminOrders: (query: URLSearchParams) => `/v1/admin/orders?${query.toString()}`,
  adminOrdersExport: (query: URLSearchParams) => `/v1/admin/orders/export?${query.toString()}`,
  adminOrderAction: (orderId: string, action: 'approve' | 'cancel') =>
    `/v1/admin/orders/${encodeURIComponent(orderId)}/${action}`,
  adminCustomers: (query: URLSearchParams) => `/v1/admin/customers?${query.toString()}`,
  adminCustomersExport: (query: URLSearchParams) =>
    `/v1/admin/customers/export?${query.toString()}`,
  adminUser: (userId: string) => `/v1/admin/users/${encodeURIComponent(userId)}`,
} as const
