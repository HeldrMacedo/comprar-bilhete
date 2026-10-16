import type {
  CustomerRegistration,
  ExternalCustomer,
  NormalizedCustomerInput,
} from './customer-types.js'

export interface CustomerGateway {
  findByCpf(cpf: string): Promise<ExternalCustomer | null>
  create(customer: NormalizedCustomerInput): Promise<void>
  register(input: CustomerRegistration): Promise<void>
}
