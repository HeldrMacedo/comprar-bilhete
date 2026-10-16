import { ApiError, requestJson } from '../../../shared/api/http-client'
import { apiRoutes } from '../../../shared/config/api-routes'
import { env } from '../../../shared/config/env'
import { accountResponseSchema, identifyResultSchema, noContentSchema } from '../api/schemas'
import type { Account, AccountRepository } from '../domain/types'

const liveRepository: AccountRepository = {
  async getMe(signal) {
    try {
      const response = await requestJson(apiRoutes.accountMe, accountResponseSchema, { signal })
      return response.account
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  },
  identify: (cpf) =>
    requestJson(apiRoutes.accountIdentify, identifyResultSchema, { method: 'POST', body: { cpf } }),
  async requestCode(request) {
    await requestJson(apiRoutes.accountCodes, noContentSchema, { method: 'POST', body: request })
  },
  login: async (cpf, password) =>
    (
      await requestJson(apiRoutes.accountLogin, accountResponseSchema, {
        method: 'POST',
        body: { cpf, password },
      })
    ).account,
  register: async (input) =>
    (
      await requestJson(apiRoutes.accountRegister, accountResponseSchema, {
        method: 'POST',
        body: input,
      })
    ).account,
  setPassword: async (input) =>
    (
      await requestJson(apiRoutes.accountPassword, accountResponseSchema, {
        method: 'POST',
        body: input,
      })
    ).account,
  updateProfile: async (input) =>
    (
      await requestJson(apiRoutes.accountProfile, accountResponseSchema, {
        method: 'PUT',
        body: input,
      })
    ).account,
  async logout() {
    await requestJson(apiRoutes.accountLogout, noContentSchema, { method: 'POST' })
  },
}

// Demonstração sem backend: sessão só em memória (some ao recarregar) e código 000000.
const mockMaria: Account = {
  cpf: '52998224725',
  name: 'Maria da Silva',
  email: 'maria@example.com',
  phone: '84999855367',
  address: {
    zipCode: '59062300',
    street: 'AVENIDA LIMA E SILVA',
    number: '129',
    neighborhood: 'NAZARE',
    city: 'NATAL',
    state: 'RN',
  },
  complete: true,
}
let mockSession: Account | null = null

function mockDelay() {
  return new Promise((resolve) => window.setTimeout(resolve, 250))
}

function assertMockCode(code: string) {
  if (code !== '000000')
    throw new ApiError('Código inválido ou expirado. Peça um novo código.', 400, 'INVALID_CODE')
}

const mockRepository: AccountRepository = {
  async getMe() {
    return mockSession ? structuredClone(mockSession) : null
  },
  async identify(cpf) {
    await mockDelay()
    return cpf === mockMaria.cpf ? { status: 'account' } : { status: 'new' }
  },
  async requestCode() {
    await mockDelay()
  },
  async login(cpf, password) {
    await mockDelay()
    if (cpf !== mockMaria.cpf || password.length < 8) {
      throw new ApiError('CPF ou senha inválidos.', 401, 'INVALID_CREDENTIALS')
    }
    mockSession = structuredClone(mockMaria)
    return structuredClone(mockSession)
  },
  async register({ customer, code }) {
    await mockDelay()
    assertMockCode(code)
    mockSession = { ...customer, complete: true }
    return structuredClone(mockSession)
  },
  async setPassword({ code }) {
    await mockDelay()
    assertMockCode(code)
    mockSession = structuredClone(mockMaria)
    return structuredClone(mockSession)
  },
  async updateProfile({ customer }) {
    await mockDelay()
    if (!mockSession)
      throw new ApiError('Entre na sua conta para continuar.', 401, 'UNAUTHENTICATED')
    mockSession = { ...mockSession, ...customer, complete: true }
    return structuredClone(mockSession)
  },
  async logout() {
    mockSession = null
  },
}

export const accountRepository = env.VITE_API_MODE === 'live' ? liveRepository : mockRepository
