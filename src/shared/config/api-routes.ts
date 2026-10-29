export const apiRoutes = {
  accountIdentify: '/v1/account/identify',
  accountCodes: '/v1/account/codes',
  accountLogin: '/v1/account/login',
  accountRegister: '/v1/account/register',
  accountPassword: '/v1/account/password',
  accountMe: '/v1/account/me',
  accountProfile: '/v1/account/profile',
  accountLogout: '/v1/account/logout',
  myOrders: '/v1/orders/mine',
  zipCode: (zipCode: string) => `/v1/zip-codes/${encodeURIComponent(zipCode)}`,
  activeRaffle: '/v1/raffles/active',
  raffleBanner: (raffleId: string) => `/v1/raffles/${encodeURIComponent(raffleId)}/banner`,
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
  adminSession: '/v1/admin/session',
  adminUsers: '/v1/admin/users',
  adminDashboard: '/v1/admin/dashboard',
  adminRaffles: '/v1/admin/raffles',
  adminRaffle: (source: string) => `/v1/admin/raffles/${encodeURIComponent(source)}`,
  adminSettings: '/v1/admin/settings',
  siteSettings: '/v1/site-settings',
  adminOrders: (query: URLSearchParams) => `/v1/admin/orders?${query.toString()}`,
  adminOrdersExport: (query: URLSearchParams) => `/v1/admin/orders/export?${query.toString()}`,
  adminOrderAction: (orderId: string, action: 'approve' | 'cancel' | 'resend-email') =>
    `/v1/admin/orders/${encodeURIComponent(orderId)}/${action}`,
  adminCustomerAccessCode: (cpf: string) =>
    `/v1/admin/customers/${encodeURIComponent(cpf)}/access-code`,
  adminCustomers: (query: URLSearchParams) => `/v1/admin/customers?${query.toString()}`,
  adminCustomersExport: (query: URLSearchParams) =>
    `/v1/admin/customers/export?${query.toString()}`,
  adminUser: (userId: string) => `/v1/admin/users/${encodeURIComponent(userId)}`,
} as const
