import { describe, expect, it } from 'vitest'
import { customerSchema, toCheckoutCustomer } from './customer-schema'

const address = {
  zipCode: '59062-300',
  street: 'Rua a',
  number: '10b',
  complement: '',
  neighborhood: 'Centro',
  city: 'Natal',
  state: 'rn',
}

const base = {
  name: 'Cliente Novo',
  cpf: '111.444.777-35',
  phone: '(84) 99999-8888',
  address,
}

describe('customerSchema', () => {
  it('exige endereco completo, exceto o complemento', () => {
    expect(customerSchema.safeParse(base).success).toBe(true)
    expect(customerSchema.safeParse({ ...base, address: undefined }).success).toBe(false)
    expect(customerSchema.safeParse({ ...base, address: { ...address, city: ' ' } }).success).toBe(
      false,
    )
  })

  it('normaliza o endereco em maiusculas', () => {
    expect(
      customerSchema.parse({ ...base, address: { ...address, complement: 'apto 1' } }),
    ).toMatchObject({
      address: {
        zipCode: '59062300',
        street: 'RUA A',
        number: '10B',
        complement: 'APTO 1',
        neighborhood: 'CENTRO',
        city: 'NATAL',
        state: 'RN',
      },
    })
    expect(customerSchema.parse(base).address.complement).toBeUndefined()
  })

  it('exige o nome do terceiro somente quando marcado', () => {
    expect(customerSchema.safeParse({ ...base, buyingForThirdParty: true }).success).toBe(false)
    expect(
      customerSchema.safeParse({
        ...base,
        buyingForThirdParty: true,
        beneficiaryName: 'João Terceiro',
      }).success,
    ).toBe(true)
  })

  it('envia o nome do terceiro somente quando a opção está marcada', () => {
    const parsed = customerSchema.parse(base)
    const expected = {
      name: parsed.name,
      cpf: parsed.cpf,
      phone: parsed.phone,
      address: parsed.address,
    }
    expect(
      toCheckoutCustomer({ ...parsed, buyingForThirdParty: false, beneficiaryName: 'Ignorado' }),
    ).toEqual(expected)
    expect(
      toCheckoutCustomer({
        ...parsed,
        buyingForThirdParty: true,
        beneficiaryName: ' João Terceiro ',
      }),
    ).toEqual({ ...expected, beneficiaryName: 'João Terceiro' })
  })
})
