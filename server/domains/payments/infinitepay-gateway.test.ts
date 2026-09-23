import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseServerEnv } from '../../config/env.js'
import { resolvedCustomerSchema } from '../customers/customer-types.js'
import { existingMaria, order } from '../orders/order-test-fixtures.js'
import { InfinitePayGateway } from './infinitepay-gateway.js'

const env = parseServerEnv({
  PAYMENT_PROVIDER: 'infinitepay',
  INFINITEPAY_HANDLE: 'helder-macedo',
})

const customerWithAddress = resolvedCustomerSchema.parse({
  ...existingMaria,
  address: {
    zipCode: '59062300',
    street: 'Avenida Lima e Silva',
    number: '129',
    complement: 'Casa',
    neighborhood: 'Nazare',
    city: 'Natal',
    state: 'RN',
  },
})

afterEach(() => vi.unstubAllGlobals())

describe('InfinitePayGateway', () => {
  it('envia centavos inteiros e endereco normalizado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://checkout.infinitepay.io/example' }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new InfinitePayGateway(env)

    await gateway.createCheckout(order({ customer: customerWithAddress }))

    const request = fetchMock.mock.calls[0]
    expect(request).toBeDefined()
    const body = JSON.parse(String((request?.[1] as RequestInit | undefined)?.body)) as unknown
    expect(body).toMatchObject({
      handle: 'helder-macedo',
      customer: { name: 'Maria da Silva', phone_number: '+5584999855367' },
      items: [{ quantity: 1, price: 1000 }],
      address: {
        cep: '59062300',
        street: 'Avenida Lima e Silva',
        neighborhood: 'Nazare',
        number: '129',
        complement: 'Casa',
      },
    })
  })

  it('rejeita total inconsistente antes da chamada externa', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new InfinitePayGateway(env)

    await expect(gateway.createCheckout(order({ totalInCents: 999 }))).rejects.toMatchObject({
      code: 'INVALID_ORDER_TOTAL',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
