import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrasilApiZipCodeGateway } from './brasil-api-zip-code-gateway.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BrasilApiZipCodeGateway', () => {
  it('consulta a v2 da BrasilAPI e normaliza o endereço', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        cep: '59062300',
        state: 'rn',
        city: 'Natal',
        neighborhood: 'Nossa Senhora de Nazaré',
        street: ' Avenida Lima e Silva ',
        service: 'open-cep',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      new BrasilApiZipCodeGateway('https://brasilapi.test/').lookup('59062300'),
    ).resolves.toEqual({
      zipCode: '59062300',
      street: 'Avenida Lima e Silva',
      neighborhood: 'Nossa Senhora de Nazaré',
      city: 'Natal',
      state: 'RN',
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://brasilapi.test/api/cep/v2/59062300')
  })

  it('devolve rua e bairro vazios para CEP geral de cidade', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ cep: '59300000', state: 'RN', city: 'Caicó', neighborhood: null }),
        ),
    )

    await expect(
      new BrasilApiZipCodeGateway('https://brasilapi.test').lookup('59300000'),
    ).resolves.toMatchObject({ street: '', neighborhood: '', city: 'Caicó' })
  })

  it('devolve null quando o CEP não existe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ name: 'CepPromiseError' }, { status: 404 })),
    )

    await expect(
      new BrasilApiZipCodeGateway('https://brasilapi.test').lookup('00000000'),
    ).resolves.toBeNull()
  })

  it('falha com ZIP_CODE_UNAVAILABLE quando a BrasilAPI cai ou foge do contrato', async () => {
    const gateway = new BrasilApiZipCodeGateway('https://brasilapi.test')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    await expect(gateway.lookup('59062300')).rejects.toMatchObject({
      statusCode: 502,
      code: 'ZIP_CODE_UNAVAILABLE',
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status: 500 })))
    await expect(gateway.lookup('59062300')).rejects.toMatchObject({ code: 'ZIP_CODE_UNAVAILABLE' })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ cep: '59062300' })))
    await expect(gateway.lookup('59062300')).rejects.toMatchObject({ code: 'ZIP_CODE_UNAVAILABLE' })
  })
})
