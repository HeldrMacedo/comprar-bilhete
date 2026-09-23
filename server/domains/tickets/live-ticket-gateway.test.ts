import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseServerEnv } from '../../config/env.js'
import { LiveTicketGateway } from './live-ticket-gateway.js'

const liveEnv = parseServerEnv({ TICKET_PROVIDER: 'live' })

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
  it('queries available tickets with contest and establishment 4734 only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }),
    )
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
    const fetchMock = vi.fn().mockResolvedValue(
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
      vi.fn().mockResolvedValue(
        new Response('{"error":"[database] private detail"}', { status: 500 }),
      ),
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
