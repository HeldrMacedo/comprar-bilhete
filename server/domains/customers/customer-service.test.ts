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

  it('resolves an existing CPF to canonical external data', async () => {
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

  it('uses the address revised at checkout for an existing customer', async () => {
    const service = new CustomerService(createGateway([maria]).gateway)
    const revised = { ...maria.address!, street: 'Rua Nova', number: '45' }

    await expect(
      service.resolveForOrder({
        name: maria.name,
        cpf: maria.cpf,
        phone: maria.phone,
        address: revised,
      }),
    ).resolves.toMatchObject({ address: revised, registrationStatus: 'existing' })
  })

  it('keeps the submitted phone when the external customer omits it', async () => {
    const incomplete = { ...maria, phone: '' }
    const service = new CustomerService(createGateway([incomplete]).gateway)

    await expect(
      service.resolveForOrder({
        name: 'Nome digitado',
        cpf: maria.cpf,
        phone: maria.phone,
      }),
    ).resolves.toMatchObject({
      externalId: maria.externalId,
      name: maria.name,
      cpf: maria.cpf,
      phone: maria.phone,
      registrationStatus: 'existing',
    })
  })

  it('ignores the phone when resolving the customer', async () => {
    const service = new CustomerService(createGateway([maria]).gateway)

    await expect(
      service.resolveForOrder({ name: 'Cliente', cpf: maria.cpf, phone: '84999998888' }),
    ).resolves.toMatchObject({ externalId: maria.externalId, registrationStatus: 'existing' })
  })

  it('keeps the beneficiary name for a purchase made for someone else', async () => {
    const service = new CustomerService(createGateway([maria]).gateway)

    await expect(
      service.resolveForOrder({
        name: maria.name,
        cpf: maria.cpf,
        phone: maria.phone,
        beneficiaryName: 'João Terceiro',
      }),
    ).resolves.toMatchObject({ name: maria.name, beneficiaryName: 'João Terceiro' })
  })

  it('requires an address for an existing customer without one', async () => {
    const service = new CustomerService(createGateway([{ ...maria, address: undefined }]).gateway)

    await expect(
      service.resolveForOrder({ name: maria.name, cpf: maria.cpf, phone: maria.phone }),
    ).rejects.toMatchObject({ code: 'ADDRESS_REQUIRED' })
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

  it('registers only a new customer and returns its external id', async () => {
    const records: ExternalCustomer[] = []
    const { gateway, create } = createGateway(records)
    create.mockImplementation(async (customer) => {
      records.push({ ...customer, externalId: '3030' })
    })
    const service = new CustomerService(gateway)

    await expect(
      service.ensureRegistered({ ...maria, registrationStatus: 'existing' }),
    ).resolves.toMatchObject({ externalId: maria.externalId })
    await expect(
      service.ensureRegistered({
        name: 'Cliente Novo',
        cpf: '11144477735',
        phone: '84999998888',
        address: maria.address,
        registrationStatus: 'new',
      }),
    ).resolves.toMatchObject({ externalId: '3030' })

    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({
      name: 'Cliente Novo',
      cpf: '11144477735',
      phone: '84999998888',
      address: maria.address,
    })
  })

  it('reuses a person registered by a previous attempt', async () => {
    const { gateway, create } = createGateway([
      { ...maria, externalId: '4040', cpf: '11144477735' },
    ])
    const service = new CustomerService(gateway)

    await expect(
      service.ensureRegistered({
        name: 'Cliente Novo',
        cpf: '11144477735',
        phone: '84999998888',
        address: maria.address,
        registrationStatus: 'new',
      }),
    ).resolves.toMatchObject({ externalId: '4040' })
    expect(create).not.toHaveBeenCalled()
  })
})
