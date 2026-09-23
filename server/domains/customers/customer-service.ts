import { DomainError } from '../../shared/errors.js'
import type { CustomerGateway } from './customer-gateway.js'
import {
  addressSchema,
  customerInputSchema,
  type CustomerInput,
  type CustomerLookupCriteria,
  type CustomerLookupResult,
  type ResolvedCustomer,
} from './customer-types.js'

export class CustomerService {
  constructor(private readonly gateway: CustomerGateway) {}

  async lookup(criteria: CustomerLookupCriteria): Promise<CustomerLookupResult> {
    const values = [criteria.cpf, criteria.phone].filter(Boolean)
    if (values.length !== 1) {
      throw new DomainError('Informe CPF ou telefone, mas não ambos.', 400, 'CUSTOMER_LOOKUP_INVALID')
    }

    const customer = criteria.cpf
      ? await this.gateway.findByCpf(criteria.cpf)
      : await this.gateway.findByPhone(criteria.phone!)

    return customer ? { found: true, customer } : { found: false }
  }

  async resolveForOrder(input: CustomerInput): Promise<ResolvedCustomer> {
    const customer = customerInputSchema.parse(input)
    const [byCpf, byPhone] = await Promise.all([
      this.gateway.findByCpf(customer.cpf),
      this.gateway.findByPhone(customer.phone),
    ])

    if (byCpf && byPhone && byCpf.externalId !== byPhone.externalId) {
      throw new DomainError(
        'CPF e telefone pertencem a cadastros diferentes.',
        409,
        'CUSTOMER_CONFLICT',
      )
    }

    const existing = byCpf ?? byPhone
    if (existing) {
      return {
        ...existing,
        registrationStatus: 'existing',
      }
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

  async ensureRegistered(customer: ResolvedCustomer): Promise<void> {
    if (customer.registrationStatus === 'existing') return

    await this.gateway.create(
      customerInputSchema.parse({
        name: customer.name,
        cpf: customer.cpf,
        phone: customer.phone,
        address: customer.address,
      }),
    )
  }
}
