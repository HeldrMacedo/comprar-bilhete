import type { CustomerGateway } from './customer-gateway.js'
import {
  externalCustomerSchema,
  type ExternalCustomer,
  type NormalizedCustomerInput,
} from './customer-types.js'

const maria = externalCustomerSchema.parse({
  externalId: '2015',
  name: 'Maria da Silva',
  cpf: '52998224725',
  phone: '84999855367',
})

export class MockCustomerGateway implements CustomerGateway {
  private readonly customers: ExternalCustomer[] = [maria]

  async findByCpf(cpf: string) {
    return this.clone(this.customers.find((customer) => customer.cpf === cpf) ?? null)
  }

  async findByPhone(phone: string) {
    return this.clone(this.customers.find((customer) => customer.phone === phone) ?? null)
  }

  async create(customer: NormalizedCustomerInput): Promise<void> {
    this.customers.push(
      externalCustomerSchema.parse({
        ...customer,
        externalId: `mock-${this.customers.length + 1}`,
      }),
    )
  }

  private clone(customer: ExternalCustomer | null) {
    return customer ? structuredClone(customer) : null
  }
}
