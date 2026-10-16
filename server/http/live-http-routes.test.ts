import { expect, it, vi } from 'vitest'
import { buildApp } from '../app.js'
import { parseServerEnv } from '../config/env.js'
import { MockMailGateway } from '../domains/accounts/mock-mail-gateway.js'
import { MockCustomerGateway } from '../domains/customers/mock-customer-gateway.js'
import { CUSTOMER_SESSION_COOKIE } from './customer-session.js'

// Com provider live o código não é o fixo: lê o código real enviado ao e-mail simulado.
async function firstAccessAsMaria(
  app: Awaited<ReturnType<typeof buildApp>>,
  mail: MockMailGateway,
) {
  const codes = await app.inject({
    method: 'POST',
    url: '/api/v1/account/codes',
    payload: { purpose: 'first_access', cpf: '52998224725' },
  })
  expect(codes.statusCode, codes.body).toBe(202)
  const code = mail.sent.at(-1)?.code
  if (!code) throw new Error('nenhum código enviado')
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/account/password',
    payload: { cpf: '52998224725', code, password: 'senha-maria-1' },
  })
  const cookie = response.cookies.find((item) => item.name === CUSTOMER_SESSION_COOKIE)
  if (!cookie) throw new Error(`primeiro acesso falhou: ${response.body}`)
  return { [CUSTOMER_SESSION_COOKIE]: cookie.value }
}

it('consulta concurso e bilhetes por HTTP, bloqueando criação de pedido', async () => {
  const fetchMock = vi.fn().mockImplementation(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith('/concurso/atual')
            ? [
                {
                  concurso_id_sorteiocap: 2026041,
                  data_sorteiocap: '2026-09-27',
                  data_fim_sorteiocap: '2026-09-27 19:00:00',
                  hora_sorteiocap: '20:00:00',
                  qte_premios_sorteiocap: 4,
                  qtd_giros_sorteiocap: 20,
                  valor_bilhete_sorteiocap: 6,
                  concurso_id_sorteioesp: 2026000,
                },
              ]
            : { success: true, data: [] },
        ),
        { status: 200 },
      ),
  )
  vi.stubGlobal('fetch', fetchMock)
  const mail = new MockMailGateway()
  const app = await buildApp({
    env: parseServerEnv({
      DATABASE_PATH: ':memory:',
      TICKET_PROVIDER: 'live',
      PAYMENT_PROVIDER: 'mock',
      TICKET_API_BASE_URL: 'http://66.94.99.64:9090',
    }),
    // Sem TLS o gateway live recusa qualquer CPF, então a conta vem do cadastro simulado.
    customers: new MockCustomerGateway(),
    mail,
    logger: false,
    startWorker: false,
    now: () => new Date('2026-09-25T12:00:00Z'),
  })

  try {
    const raffles = await app.inject({ method: 'GET', url: '/api/v1/raffles/active' })
    expect(raffles.statusCode).toBe(200)
    expect(raffles.json()).toEqual([
      expect.objectContaining({ id: '2026041', purchaseEnabled: false }),
    ])

    const cards = await app.inject({ method: 'GET', url: '/api/v1/raffles/2026041/cards' })
    expect(cards.statusCode).toBe(200)

    const order = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      cookies: await firstAccessAsMaria(app, mail),
      payload: {
        raffles: [{ raffleId: '2026041', selection: { mode: 'random', quantity: 1 } }],
      },
    })
    expect(order.statusCode).toBe(503)
    expect(order.json()).toMatchObject({ code: 'TICKET_API_TLS_REQUIRED' })
    const checkout = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/00000000-0000-4000-8000-000000000001/checkout',
    })
    expect(checkout.statusCode).toBe(503)
    expect(checkout.json()).toMatchObject({ code: 'TICKET_API_TLS_REQUIRED' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  } finally {
    await app.close()
    vi.unstubAllGlobals()
  }
})

it('habilita compra por HTTP quando TICKET_API_ALLOW_HTTP=true', async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith('/concurso/atual')) {
      return Response.json([
        {
          concurso_id_sorteiocap: 2026041,
          data_sorteiocap: '2026-09-27',
          data_fim_sorteiocap: '2026-09-27 19:00:00',
          hora_sorteiocap: '20:00:00',
          qte_premios_sorteiocap: 4,
          qtd_giros_sorteiocap: 20,
          valor_bilhete_sorteiocap: 6,
          concurso_id_sorteioesp: 2026000,
        },
      ])
    }
    if (url.endsWith('/pessoa/cpf/52998224725')) {
      return Response.json({
        success: true,
        data: {
          pessoas_id: 2015,
          nome: 'Maria da Silva',
          cpf: '52998224725',
          fone: '84999855367',
          email: 'maria@example.com',
          cep: '59062300',
          endereco: 'AVENIDA LIMA E SILVA',
          numero: '129',
          bairro: 'NAZARE',
          cidade: 'NATAL',
          uf: 'RN',
        },
      })
    }
    if (url.endsWith('/pessoa/cadastro')) return Response.json({ success: true }, { status: 201 })
    return Response.json({ error: 'Pessoa não encontrada' }, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  const mail = new MockMailGateway()
  const app = await buildApp({
    env: parseServerEnv({
      DATABASE_PATH: ':memory:',
      TICKET_PROVIDER: 'live',
      PAYMENT_PROVIDER: 'mock',
      TICKET_API_BASE_URL: 'http://66.94.99.64:9090',
      TICKET_API_ALLOW_HTTP: 'true',
    }),
    mail,
    logger: false,
    startWorker: false,
    now: () => new Date('2026-09-25T12:00:00Z'),
  })

  try {
    const raffles = await app.inject({ method: 'GET', url: '/api/v1/raffles/active' })
    expect(raffles.json()).toEqual([
      expect.objectContaining({ id: '2026041', purchaseEnabled: true }),
    ])

    const cookies = await firstAccessAsMaria(app, mail)
    const me = await app.inject({ method: 'GET', url: '/api/v1/account/me', cookies })
    expect(me.json()).toMatchObject({ account: { cpf: '52998224725', complete: true } })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://66.94.99.64:9090/pessoa/cpf/52998224725',
      expect.anything(),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'http://66.94.99.64:9090/pessoa/cadastro',
      expect.objectContaining({ method: 'POST' }),
    )
  } finally {
    await app.close()
    vi.unstubAllGlobals()
  }
})

it('repassa o banner do concurso pela própria API sem expor a origem HTTP', async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) =>
    url.endsWith('/concurso/atual')
      ? new Response(
          JSON.stringify([
            {
              concurso_id_sorteiocap: 2026041,
              data_sorteiocap: '2026-09-27',
              data_fim_sorteiocap: '2026-09-27 19:00:00',
              hora_sorteiocap: '20:00:00',
              qte_premios_sorteiocap: 4,
              qtd_giros_sorteiocap: 20,
              valor_bilhete_sorteiocap: 6,
              banner_sorteiocap: 'app/images/banners/cap.png',
              concurso_id_sorteioesp: 2026000,
            },
          ]),
          { status: 200 },
        )
      : new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }),
  )
  vi.stubGlobal('fetch', fetchMock)
  const app = await buildApp({
    env: parseServerEnv({
      DATABASE_PATH: ':memory:',
      TICKET_PROVIDER: 'live',
      PAYMENT_PROVIDER: 'mock',
      TICKET_BANNER_BASE_URL: 'http://imagens.example:8080',
    }),
    logger: false,
    startWorker: false,
    now: () => new Date('2026-09-25T12:00:00Z'),
  })

  try {
    const raffles = await app.inject({ method: 'GET', url: '/api/v1/raffles/active' })
    expect(raffles.json()).toEqual([expect.objectContaining({ id: '2026041', hasBanner: true })])
    expect(raffles.body).not.toContain('imagens.example')

    const banner = await app.inject({ method: 'GET', url: '/api/v1/raffles/2026041/banner' })
    expect(banner.statusCode).toBe(200)
    expect(banner.headers['content-type']).toBe('image/png')
    expect(banner.rawPayload).toEqual(Buffer.from([137, 80, 78, 71]))
    expect(fetchMock).toHaveBeenCalledWith(
      'http://imagens.example:8080/app/images/banners/cap.png',
      expect.anything(),
    )

    const missing = await app.inject({ method: 'GET', url: '/api/v1/raffles/2026999/banner' })
    expect(missing.statusCode).toBe(404)
  } finally {
    await app.close()
    vi.unstubAllGlobals()
  }
})
