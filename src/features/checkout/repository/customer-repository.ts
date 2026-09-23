import { requestJson } from '../../../shared/api/http-client'
import { apiRoutes } from '../../../shared/config/api-routes'
import { env } from '../../../shared/config/env'
import { customerLookupSchema } from '../api/schemas'
import type {
  CustomerRepository,
  ExternalCustomer,
} from '../domain/types'

const mockMaria: ExternalCustomer = {
  externalId: '2015',
  name: 'Maria da Silva',
  cpf: '52998224725',
  phone: '84999855367',
}

const liveCustomerRepository: CustomerRepository = {
  lookup(criteria, signal) {
    return requestJson(apiRoutes.customerLookup(criteria), customerLookupSchema, { signal })
  },
}

const mockCustomerRepository: CustomerRepository = {
  async lookup(criteria) {
    await new Promise((resolve) => window.setTimeout(resolve, 250))
    if (criteria.cpf === mockMaria.cpf || criteria.phone === mockMaria.phone) {
      return { found: true, customer: structuredClone(mockMaria) }
    }
    return { found: false }
  },
}

export const customerRepository =
  env.VITE_API_MODE === 'live' ? liveCustomerRepository : mockCustomerRepository
