import { ApiError, requestFile, requestJson } from '../../../shared/api/http-client'
import { apiRoutes } from '../../../shared/config/api-routes'
import { env } from '../../../shared/config/env'
import {
  adminOrderResponseSchema,
  adminSettingsSchema,
  contestListSchema,
  contestResponseSchema,
  adminOrdersPageSchema,
  adminUserResponseSchema,
  adminUsersResponseSchema,
  customersPageSchema,
  dashboardSummarySchema,
  noContentSchema,
} from '../api/schemas'
import type { AdminRepository, PageRequest } from '../domain/types'

function toQuery(filters: Record<string, string | undefined>, page?: PageRequest) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value)
  if (page) {
    query.set('page', String(page.page))
    query.set('pageSize', String(page.pageSize))
  }
  return query
}

const liveRepository: AdminRepository = {
  async getSession(signal) {
    try {
      const response = await requestJson(apiRoutes.adminSession, adminUserResponseSchema, {
        signal,
      })
      return response.user
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  },
  async login(credentials) {
    const response = await requestJson(apiRoutes.adminSession, adminUserResponseSchema, {
      method: 'POST',
      body: credentials,
    })
    return response.user
  },
  async logout() {
    await requestJson(apiRoutes.adminSession, noContentSchema, { method: 'DELETE' })
  },
  async listUsers(signal) {
    const response = await requestJson(apiRoutes.adminUsers, adminUsersResponseSchema, { signal })
    return response.users
  },
  async createUser(input) {
    const response = await requestJson(apiRoutes.adminUsers, adminUserResponseSchema, {
      method: 'POST',
      body: input,
    })
    return response.user
  },
  async updateUser(userId, input) {
    const response = await requestJson(apiRoutes.adminUser(userId), adminUserResponseSchema, {
      method: 'PATCH',
      body: input,
    })
    return response.user
  },
  async deleteUser(userId) {
    await requestJson(apiRoutes.adminUser(userId), noContentSchema, { method: 'DELETE' })
  },
  listOrders(filters, page, signal) {
    return requestJson(apiRoutes.adminOrders(toQuery(filters, page)), adminOrdersPageSchema, {
      signal,
    })
  },
  async runOrderAction(orderId, action, reason) {
    const response = await requestJson(
      apiRoutes.adminOrderAction(orderId, action),
      adminOrderResponseSchema,
      { method: 'POST', body: { reason } },
    )
    return response.order
  },
  exportOrders(filters) {
    return requestFile(apiRoutes.adminOrdersExport(toQuery(filters)), 'vendas.csv')
  },
  listCustomers(filters, page, signal) {
    return requestJson(apiRoutes.adminCustomers(toQuery(filters, page)), customersPageSchema, {
      signal,
    })
  },
  exportCustomers(filters) {
    return requestFile(apiRoutes.adminCustomersExport(toQuery(filters)), 'clientes.csv')
  },
  getDashboard(signal) {
    return requestJson(apiRoutes.adminDashboard, dashboardSummarySchema, { signal })
  },
  async listRaffles(signal) {
    const response = await requestJson(apiRoutes.adminRaffles, contestListSchema, { signal })
    return response.raffles
  },
  async updateRaffle(source, values) {
    const response = await requestJson(apiRoutes.adminRaffle(source), contestResponseSchema, {
      method: 'PUT',
      body: values,
    })
    return response.raffle
  },
  getSettings(signal) {
    return requestJson(apiRoutes.adminSettings, adminSettingsSchema, { signal })
  },
  updateSettings(youtubeUrl) {
    return requestJson(apiRoutes.adminSettings, adminSettingsSchema, {
      method: 'PUT',
      body: { youtubeUrl },
    })
  },
}

// Sem backend não há sessão: o painel avisa em vez de simular um login.
function unavailable(): never {
  throw new ApiError('O painel administrativo exige VITE_API_MODE=live e o backend em execução.')
}

const mockRepository: AdminRepository = {
  getSession: async () => unavailable(),
  login: async () => unavailable(),
  logout: async () => unavailable(),
  listUsers: async () => unavailable(),
  createUser: async () => unavailable(),
  updateUser: async () => unavailable(),
  deleteUser: async () => unavailable(),
  listOrders: async () => unavailable(),
  runOrderAction: async () => unavailable(),
  exportOrders: async () => unavailable(),
  listCustomers: async () => unavailable(),
  exportCustomers: async () => unavailable(),
  getDashboard: async () => unavailable(),
  listRaffles: async () => unavailable(),
  updateRaffle: async () => unavailable(),
  getSettings: async () => unavailable(),
  updateSettings: async () => unavailable(),
}

export const adminRepository = env.VITE_API_MODE === 'live' ? liveRepository : mockRepository
