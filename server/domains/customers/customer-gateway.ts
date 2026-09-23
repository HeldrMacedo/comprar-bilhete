import type { ExternalCustomer, NormalizedCustomerInput } from './customer-types.js'

export interface CustomerGateway {
  findByCpf(cpf: string): Promise<ExternalCustomer | null>
  findByPhone(phone: string): Promise<ExternalCustomer | null>
  create(customer: NormalizedCustomerInput): Promise<void>
}
