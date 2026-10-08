export type AdminUser = {
  id: string
  login: string
  name: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export type AdminCredentials = { login: string; password: string }

export type CreateAdminUserInput = { login: string; name: string; password: string }

export type UpdateAdminUserInput = Partial<CreateAdminUserInput & { active: boolean }>

export type OrderStatus =
  'pending' | 'processing' | 'paid' | 'expired' | 'cancelled' | 'manual_review'

export type AdminOrder = {
  id: string
  status: OrderStatus
  createdAt: string
  expiresAt: string
  paidAt?: string
  totalInCents: number
  paidAmountInCents?: number
  captureMethod?: string
  lastError?: string
  customer: { name: string; cpf: string; phone: string; beneficiaryName?: string }
  items: Array<{
    id: string
    code: string
    raffleId: string
    raffleTitle: string
    unitPriceInCents: number
  }>
}

export type SalesFilters = { q?: string; status?: OrderStatus; from?: string; to?: string }

export type CustomerFilters = {
  q?: string
  purchase?: 'paid' | 'unpaid'
  from?: string
  to?: string
}

export type PageRequest = { page: number; pageSize: number }

export type PageResult<Key extends string, Row> = PageRequest & { total: number } & Record<
    Key,
    Row[]
  >

export type CustomerSummary = {
  cpf: string
  name: string
  phone: string
  address?: {
    zipCode: string
    street: string
    number: string
    complement?: string
    neighborhood: string
    city: string
    state: string
  }
  orderCount: number
  paidOrderCount: number
  paidTotalInCents: number
  ticketCount: number
  firstOrderAt: string
  lastOrderAt: string
}

export type OrderAction = 'approve' | 'cancel'

export type DownloadedFile = { blob: Blob; fileName: string }

export type DashboardSummary = {
  generatedAt: string
  totals: {
    customers: number
    paidTickets: number
    paidOrders: number
    revenueInCents: number
    pendingTickets: number
    pendingOrders: number
    manualReviewOrders: number
  }
  dailySales: Array<{ day: string; revenueInCents: number; tickets: number }>
  ordersByStatus: Array<{ status: OrderStatus; orders: number }>
  ticketsByRaffle: Array<{
    raffleId: string
    raffleTitle: string
    tickets: number
    revenueInCents: number
  }>
  upcomingRaffles: Array<{
    id: string
    title: string
    drawDate: string
    salesEndAt?: string
    priceInCents: number
    prizes: string[]
    paidTickets: number
    revenueInCents: number
  }> | null
  upcomingRafflesError?: string
}

export type ContestSource = 'cap' | 'esp'

// Datas e horas locais (America/Fortaleza), no formato dos campos date/time/datetime-local.
export type ContestValues = {
  salesStartAt: string
  salesEndAt: string
  drawDate: string
  drawTime: string
  priceInCents: number
  prizes: string[]
  luckySpinsCount: number
  luckySpinsLabel: string
  doubleChance: boolean
}

export type ContestSlot = ContestValues & { source: ContestSource; contestId: string }

export type AdminSiteSettings = { youtubeVideoId: string | null; youtubeUrl: string }

export interface AdminRepository {
  getSession(signal?: AbortSignal): Promise<AdminUser | null>
  login(credentials: AdminCredentials): Promise<AdminUser>
  logout(): Promise<void>
  listUsers(signal?: AbortSignal): Promise<AdminUser[]>
  createUser(input: CreateAdminUserInput): Promise<AdminUser>
  updateUser(userId: string, input: UpdateAdminUserInput): Promise<AdminUser>
  deleteUser(userId: string): Promise<void>
  listOrders(
    filters: SalesFilters,
    page: PageRequest,
    signal?: AbortSignal,
  ): Promise<PageResult<'orders', AdminOrder>>
  runOrderAction(orderId: string, action: OrderAction, reason: string): Promise<AdminOrder>
  exportOrders(filters: SalesFilters): Promise<DownloadedFile>
  listCustomers(
    filters: CustomerFilters,
    page: PageRequest,
    signal?: AbortSignal,
  ): Promise<PageResult<'customers', CustomerSummary>>
  exportCustomers(filters: CustomerFilters): Promise<DownloadedFile>
  getDashboard(signal?: AbortSignal): Promise<DashboardSummary>
  listRaffles(signal?: AbortSignal): Promise<ContestSlot[]>
  updateRaffle(source: ContestSource, values: ContestValues): Promise<ContestSlot>
  getSettings(signal?: AbortSignal): Promise<AdminSiteSettings>
  updateSettings(youtubeUrl: string): Promise<AdminSiteSettings>
}
