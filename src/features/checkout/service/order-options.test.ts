import { describe, expect, it } from 'vitest'
import { orderOptionsSchema, toOrderOptions } from './order-options'

describe('orderOptionsSchema', () => {
  it('exige email valido e normaliza o informado', () => {
    expect(orderOptionsSchema.parse({ email: ' Maria@Example.com ' }).email).toBe(
      'maria@example.com',
    )
    expect(orderOptionsSchema.safeParse({ email: '' }).success).toBe(false)
    expect(orderOptionsSchema.safeParse({ email: 'maria@' }).success).toBe(false)
  })

  it('exige o nome do terceiro somente quando marcado', () => {
    const base = { email: 'maria@example.com' }
    expect(orderOptionsSchema.safeParse(base).success).toBe(true)
    expect(orderOptionsSchema.safeParse({ ...base, buyingForThirdParty: true }).success).toBe(false)
    expect(
      orderOptionsSchema.safeParse({
        ...base,
        buyingForThirdParty: true,
        beneficiaryName: 'João Terceiro',
      }).success,
    ).toBe(true)
  })
})

describe('toOrderOptions', () => {
  it('envia o nome do terceiro somente quando a opção está marcada', () => {
    const email = 'maria@example.com'
    expect(
      toOrderOptions({ email, buyingForThirdParty: false, beneficiaryName: 'Ignorado' }),
    ).toEqual({ email })
    expect(
      toOrderOptions({ email, buyingForThirdParty: true, beneficiaryName: ' João Terceiro ' }),
    ).toEqual({ email, beneficiaryName: 'João Terceiro' })
  })
})
