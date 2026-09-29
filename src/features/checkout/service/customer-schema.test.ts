import { describe, expect, it } from 'vitest'
import { createCustomerSchema, toCheckoutCustomer } from './customer-schema'

const base = {
  name: 'Cliente Novo',
  cpf: '111.444.777-35',
  phone: '(84) 99999-8888',
}

describe('createCustomerSchema', () => {
  it('requires address only when requested by lookup state', () => {
    expect(createCustomerSchema(false).safeParse(base).success).toBe(true)
    expect(createCustomerSchema(true).safeParse(base).success).toBe(false)
    expect(
      createCustomerSchema(true).safeParse({
        ...base,
        address: {
          zipCode: '59062300',
          street: 'Rua A',
          number: '10',
          neighborhood: 'Centro',
          city: 'Natal',
          state: 'rn',
        },
      }).success,
    ).toBe(true)
  })

  it('exige o nome do terceiro somente quando marcado', () => {
    expect(
      createCustomerSchema(false).safeParse({ ...base, buyingForThirdParty: true }).success,
    ).toBe(false)
    expect(
      createCustomerSchema(false).safeParse({
        ...base,
        buyingForThirdParty: true,
        beneficiaryName: 'João Terceiro',
      }).success,
    ).toBe(true)
  })

  it('envia o nome do terceiro somente quando a opção está marcada', () => {
    expect(
      toCheckoutCustomer({ ...base, buyingForThirdParty: false, beneficiaryName: 'Ignorado' }),
    ).toEqual(base)
    expect(
      toCheckoutCustomer({
        ...base,
        buyingForThirdParty: true,
        beneficiaryName: ' João Terceiro ',
      }),
    ).toEqual({ ...base, beneficiaryName: 'João Terceiro' })
  })
})
