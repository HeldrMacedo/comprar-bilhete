import { describe, expect, it, vi } from 'vitest'
import type { CustomerGateway } from './customer-gateway.js'
import { CustomerService } from './customer-service.js'
import type { CustomerInput, ExternalCustomer } from './customer-types.js'

const maria: ExternalCustomer = {
  externalId: '2015',
  name: 'Maria da Silva',
  cpf: '52998224725',
  phone: '84999855367',
  address: {
    zipCode: '59062300',
    street: 'Avenida Lima e Silva',
    number: '129',
    neighborhood: 'Nazaré',
    city: 'Natal',
    state: 'RN',
  },
}

function createGateway(records: ExternalCustomer[]) {
  const create = vi.fn<(customer: CustomerInput) => Promise<void>>().mockResolvedValue(undefined)
  const gateway: CustomerGateway = {
    findByCpf: async (cpf) => records.find((item) => item.cpf === cpf) ?? null,
    findByPhone: async (phone) => records.find((item) => item.phone === phone) ?? null,
    create,
  }
  return { gateway, create }
}

describe('CustomerService', () => {
  it('returns an existing customer found by CPF', async () => {
    const service = new CustomerService(createGateway([maria]).gateway)

    await expect(service.lookup({ cpf: maria.cpf })).resolves.toEqual({
      found: true,
      customer: maria,
    })
  })

  it('returns an existing customer found by phone', async () => {
    const service = new CustomerService(createGateway([maria]).gateway)

    await expect(service.lookup({ phone: maria.phone })).resolves.toEqual({
      found: true,
      customer: maria,
    })
  })

  it('resolves matching CPF and phone to canonical external data', async () => {
    const service = new CustomerService(createGateway([maria]).gateway)

    const result = await service.resolveForOrder({
      name: 'Nome digitado',
      cpf: maria.cpf,
      phone: maria.phone,
    })

    expect(result).toEqual({
      ...maria,
      registrationStatus: 'existing',
    })
  })

  it('rejects CPF and phone owned by different people', async () => {
    const other = { ...maria, externalId: '2020', cpf: '11144477735' }
    const service = new CustomerService(createGateway([maria, other]).gateway)

    await expect(
      service.resolveForOrder({ name: 'Cliente', cpf: other.cpf, phone: maria.phone }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CUSTOMER_CONFLICT' })
  })

  it('requires a complete address for a new person', async () => {
    const service = new CustomerService(createGateway([]).gateway)

    await expect(
      service.resolveForOrder({
        name: 'Cliente Novo',
        cpf: '11144477735',
        phone: '84999998888',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'ADDRESS_REQUIRED' })
  })

  it('resolves a new person when the complete address is present', async () => {
    const service = new CustomerService(createGateway([]).gateway)
    const customer: CustomerInput = {
      name: 'Cliente Novo',
      cpf: '11144477735',
      phone: '84999998888',
      address: maria.address,
    }

    await expect(service.resolveForOrder(customer)).resolves.toEqual({
      ...customer,
      registrationStatus: 'new',
    })
  })

  it('registers only a new customer', async () => {
    const { gateway, create } = createGateway([])
    const service = new CustomerService(gateway)

    await service.ensureRegistered({ ...maria, registrationStatus: 'existing' })
    await service.ensureRegistered({
      name: 'Cliente Novo',
      cpf: '11144477735',
      phone: '84999998888',
      address: maria.address,
      registrationStatus: 'new',
    })

    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({
      name: 'Cliente Novo',
      cpf: '11144477735',
      phone: '84999998888',
      address: maria.address,
    })
  })
})
