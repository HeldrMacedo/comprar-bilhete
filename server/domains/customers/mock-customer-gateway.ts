import type { CustomerGateway } from './customer-gateway.js'
import {
  externalCustomerSchema,
  type CustomerRegistration,
  type ExternalCustomer,
  type NormalizedCustomerInput,
} from './customer-types.js'

const maria = externalCustomerSchema.parse({
  externalId: '2015',
  name: 'Maria da Silva',
  cpf: '52998224725',
  phone: '84999855367',
  email: 'maria@example.com',
  address: {
    zipCode: '59062300',
    street: 'AVENIDA LIMA E SILVA',
    number: '129',
    neighborhood: 'NAZARE',
    city: 'NATAL',
    state: 'RN',
  },
})

export class MockCustomerGateway implements CustomerGateway {
  private readonly customers: ExternalCustomer[] = [maria]

  async findByCpf(cpf: string) {
    return this.clone(this.customers.find((customer) => customer.cpf === cpf) ?? null)
  }

  async create(customer: NormalizedCustomerInput): Promise<void> {
    this.customers.push(
      externalCustomerSchema.parse({
        ...customer,
        externalId: `mock-${this.customers.length + 1}`,
      }),
    )
  }

  async register(input: CustomerRegistration): Promise<void> {
    const index = this.customers.findIndex((customer) => customer.cpf === input.cpf)
    const customer = externalCustomerSchema.parse({
      externalId: this.customers[index]?.externalId ?? `mock-${this.customers.length + 1}`,
      name: input.name,
      cpf: input.cpf,
      phone: input.phone,
      email: input.email ?? undefined,
      address: input.address,
    })
    if (index >= 0) this.customers[index] = customer
    else this.customers.push(customer)
  }

  private clone(customer: ExternalCustomer | null) {
    return customer ? structuredClone(customer) : null
  }
}
