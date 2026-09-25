import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { parseServerEnv } from '../../config/env.js'
import { order, ticket } from '../orders/order-test-fixtures.js'
import { LiveTicketGateway } from './live-ticket-gateway.js'

const liveEnv = parseServerEnv({
  TICKET_PROVIDER: 'live',
  TICKET_API_BASE_URL: 'https://bilhetes.example',
})

const externalTicket = {
  numero: '000123',
  lote_validacao: '77',
  posicao_lote: 3,
  numeros: [1, 2, 3, 4, 5],
}

function firstRequestedUrl(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.at(0)
  if (!call) throw new Error('A API externa não foi chamada.')
  return new URL(String(call[0]))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LiveTicketGateway', () => {
  it('não valida cartelas pagas por uma API HTTP', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new LiveTicketGateway(
      parseServerEnv({ TICKET_PROVIDER: 'live', TICKET_API_BASE_URL: 'http://bilhetes.test' }),
    )
    await expect(gateway.fulfillOrder(order())).rejects.toMatchObject({
      statusCode: 503,
      code: 'TICKET_API_TLS_REQUIRED',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('valida cada cartela usando seu próprio concurso', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new LiveTicketGateway(liveEnv)
    const groupedOrder = order({
      raffleId: '2026040',
      items: [
        { ...ticket('card-001'), raffleId: '2026040' },
        { ...ticket('card-001'), raffleId: '2026041' },
      ],
    })

    await gateway.fulfillOrder(groupedOrder)

    const contestIds = fetchMock.mock.calls.map((call) => {
      const options = z.object({ body: z.string() }).parse(call[1])
      const body = z.object({ concurso_id: z.number() }).parse(JSON.parse(options.body))
      return body.concurso_id
    })
    expect(contestIds).toEqual([2026040, 2026041])
  })

  it('loads both current contests and ignores a 000 sentinel', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          concurso_id_sorteiocap: 2026041,
          data_sorteiocap: '2026-09-27',
          data_fim_sorteiocap: '2026-09-27 19:00:00',
          hora_sorteiocap: '20:00:00',
          qte_premios_sorteiocap: 4,
          qtd_giros_sorteiocap: 20,
          giros_sorteiocap: 'R$: 500,00',
          valor_bilhete_sorteiocap: 6,
          concurso_id_sorteioesp: 2026000,
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new LiveTicketGateway(liveEnv, () => new Date('2026-09-22T00:00:00Z'))

    await expect(gateway.getActiveRaffles()).resolves.toEqual([
      expect.objectContaining({ id: '2026041', source: 'cap', priceInCents: 600 }),
    ])
    expect(firstRequestedUrl(fetchMock).pathname).toBe('/concurso/atual')
  })

  it('does not expose a contest after its sales deadline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            concurso_id_sorteiocap: 2026041,
            data_sorteiocap: '2026-09-27',
            data_fim_sorteiocap: '2026-09-27 19:00:00',
            hora_sorteiocap: '20:00:00',
            qte_premios_sorteiocap: 4,
            qtd_giros_sorteiocap: 20,
            giros_sorteiocap: 'R$: 500,00',
            valor_bilhete_sorteiocap: 6,
            concurso_id_sorteioesp: 2026000,
          }),
          { status: 200 },
        ),
      ),
    )
    const gateway = new LiveTicketGateway(liveEnv, () => new Date('2026-09-27T22:00:00Z'))

    await expect(gateway.getActiveRaffles()).resolves.toEqual([])
  })

  it('treats two 000 sentinels as no active contest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            concurso_id_sorteiocap: 2026000,
            concurso_id_sorteioesp: 2026000,
          }),
          { status: 200 },
        ),
      ),
    )
    const gateway = new LiveTicketGateway(liveEnv)

    await expect(gateway.getActiveRaffle()).rejects.toMatchObject({ statusCode: 404 })
  })

  it('queries available tickets with contest and establishment 4734 only', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new LiveTicketGateway(liveEnv)

    await gateway.getAvailableTickets('2026040')

    const url = firstRequestedUrl(fetchMock)
    expect(url.pathname).toBe('/bilhete/disponiveis')
    expect(url.searchParams.get('concurso_id')).toBe('2026040')
    expect(url.searchParams.get('estabelecimento_id')).toBe('4734')
    expect(url.searchParams.get('pagina')).toBe('1')
    expect(url.searchParams.has('id_regional')).toBe(false)
  })

  it('loads a manual ticket through the exact-number endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: externalTicket }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new LiveTicketGateway(liveEnv)

    await expect(gateway.getAvailableTicket('2026040', '000123')).resolves.toEqual({
      id: '000123',
      code: '000123',
      numbers: [1, 2, 3, 4, 5],
      validationBatch: '77',
      batchPosition: 3,
    })
    const url = firstRequestedUrl(fetchMock)
    expect(url.pathname).toBe('/bilhete/disponivel/numero')
    expect(url.searchParams.get('concurso_id')).toBe('2026040')
    expect(url.searchParams.get('estabelecimento_id')).toBe('4734')
    expect(url.searchParams.get('numero')).toBe('000123')
    expect(url.searchParams.has('id_regional')).toBe(false)
  })

  it('maps an exact-ticket 404 to null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })))
    const gateway = new LiveTicketGateway(liveEnv)

    await expect(gateway.getAvailableTicket('2026040', '000123')).resolves.toBeNull()
  })

  it('hides upstream database details when ticket listing fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('{"error":"[database] private detail"}', { status: 500 })),
    )
    const gateway = new LiveTicketGateway(liveEnv)

    await expect(gateway.getAvailableTickets('2026040')).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
      message: 'Serviço externo indisponível.',
    })
  })

  it('rejects a live configuration outside Sol da Sorte scope', () => {
    expect(() =>
      parseServerEnv({ TICKET_PROVIDER: 'live', TICKET_ESTABLISHMENT_ID: '9999' }),
    ).toThrow()
    expect(() => parseServerEnv({ TICKET_PROVIDER: 'live', TICKET_REGIONAL_ID: '99' })).toThrow()
  })
})
