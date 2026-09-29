import { DomainError } from '../../shared/errors.js'
import type { CustomerGateway } from './customer-gateway.js'
import {
  addressSchema,
  customerInputSchema,
  resolvedCustomerSchema,
  type CustomerInput,
  type CustomerLookupCriteria,
  type CustomerLookupResult,
  type ResolvedCustomer,
} from './customer-types.js'

export class CustomerService {
  constructor(private readonly gateway: CustomerGateway) {}

  async lookup(criteria: CustomerLookupCriteria): Promise<CustomerLookupResult> {
    const customer = await this.gateway.findByCpf(criteria.cpf)
    return customer ? { found: true, customer } : { found: false }
  }

  async resolveForOrder(input: CustomerInput): Promise<ResolvedCustomer> {
    const customer = customerInputSchema.parse(input)
    const existing = await this.gateway.findByCpf(customer.cpf)
    if (existing) {
      return resolvedCustomerSchema.parse({
        ...customer,
        ...existing,
        name: existing.name.trim() || customer.name,
        cpf: existing.cpf || customer.cpf,
        phone: existing.phone || customer.phone,
        registrationStatus: 'existing',
      })
    }

    if (!addressSchema.safeParse(customer.address).success) {
      throw new DomainError(
        'Informe o endereço completo para cadastrar o participante.',
        400,
        'ADDRESS_REQUIRED',
      )
    }

    return {
      ...customer,
      address: addressSchema.parse(customer.address),
      registrationStatus: 'new',
    }
  }

  // Devolve o cliente com o `externalId` (pessoas_id) exigido para vincular o bilhete.
  // Consulta por CPF antes de cadastrar para não duplicar a pessoa em reprocessamentos.
  async ensureRegistered(customer: ResolvedCustomer): Promise<ResolvedCustomer> {
    if (customer.externalId) return customer

    const registered = await this.gateway.findByCpf(customer.cpf)
    if (registered) return { ...customer, externalId: registered.externalId }

    await this.gateway.create(
      customerInputSchema.parse({
        name: customer.name,
        cpf: customer.cpf,
        phone: customer.phone,
        address: customer.address,
      }),
    )
    const created = await this.gateway.findByCpf(customer.cpf)
    if (!created) {
      throw new DomainError(
        'Cadastro da pessoa não foi localizado após a criação.',
        502,
        'CUSTOMER_NOT_REGISTERED',
      )
    }
    return { ...customer, externalId: created.externalId }
  }
}
