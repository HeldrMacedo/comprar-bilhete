import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.js'
import { LiveCustomerGateway } from './live-customer-gateway.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LiveCustomerGateway', () => {
  it('normalizes a person returned by phone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            message: 'Pessoa encontrada com sucesso',
            data: {
              pessoas_id: 2015,
              nome: 'MARIA DA SILVA',
              cpf: '529.982.247-25',
              fone: '(84) 99985-5367',
              cep: '59062300',
              endereco: 'Avenida Lima e Silva',
              numero: '129',
              complemento: '',
              bairro: 'Nazaré',
              cidade: 'Natal',
              uf: 'RN',
              dt_cadastro: '2020-12-22 08:39:44',
            },
          }),
          { status: 200 },
        ),
      ),
    )

    const gateway = new LiveCustomerGateway('http://tickets.test')

    await expect(gateway.findByPhone('84999855367')).resolves.toEqual({
      externalId: '2015',
      name: 'MARIA DA SILVA',
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
    })
  })

  it('preserves missing external CPF as an editable empty value', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              pessoas_id: 2015,
              nome: 'MARIA DA SILVA',
              cpf: '',
              fone: '(84) 99985-5367',
              cep: '',
              endereco: '',
              numero: '',
              complemento: '',
              bairro: '',
              cidade: '',
              uf: '',
            },
          }),
          { status: 200 },
        ),
      ),
    )

    const gateway = new LiveCustomerGateway('http://tickets.test')

    await expect(gateway.findByPhone('84999855367')).resolves.toEqual({
      externalId: '2015',
      name: 'MARIA DA SILVA',
      cpf: '',
      phone: '84999855367',
    })
  })

  it('maps 404 to null and hides a 500 upstream body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(
        new Response('{"error":"internal database detail"}', { status: 500 }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new LiveCustomerGateway('http://tickets.test')

    await expect(gateway.findByCpf('52998224725')).resolves.toBeNull()
    await expect(gateway.findByCpf('52998224725')).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
      message: 'Serviço externo indisponível.',
    })
  })
})

describe('customer lookup route', () => {
  it('returns a deterministic mock customer by CPF', async () => {
    const app = await buildApp({ logger: false, startWorker: false })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/customers/lookup?cpf=52998224725',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      found: true,
      customer: { externalId: '2015', cpf: '52998224725', phone: '84999855367' },
    })
    await app.close()
  })

  it.each([
    '/api/v1/customers/lookup',
    '/api/v1/customers/lookup?cpf=52998224725&phone=84999855367',
    '/api/v1/customers/lookup?cpf=123',
  ])('rejects invalid lookup query %s', async (url) => {
    const app = await buildApp({ logger: false, startWorker: false })

    const response = await app.inject({ method: 'GET', url })

    expect(response.statusCode).toBe(400)
    await app.close()
  })
})
