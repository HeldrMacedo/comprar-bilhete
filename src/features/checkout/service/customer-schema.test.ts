import { describe, expect, it } from 'vitest'
import { createCustomerSchema } from './customer-schema'

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
})
