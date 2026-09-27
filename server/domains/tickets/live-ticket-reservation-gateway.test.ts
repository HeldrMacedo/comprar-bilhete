import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseServerEnv } from '../../config/env.js'
import { LiveTicketReservationGateway } from './live-ticket-reservation-gateway.js'

const env = parseServerEnv({
  TICKET_PROVIDER: 'live',
  TICKET_RESERVATION_PROVIDER: 'live',
  TICKET_API_BASE_URL: 'https://bilhetes.example',
})
const key = { raffleId: '2026041', ticketNumber: '000123' }

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status })
}

function requestAt(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  const call = fetchMock.mock.calls.at(index)
  if (!call) throw new Error('A API de bilhetes não foi chamada.')
  const init: RequestInit = call[1]
  return {
    url: String(call[0]),
    method: init.method,
    body: JSON.parse(String(init.body ?? 'null')),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LiveTicketReservationGateway', () => {
  it('reserva com PUT reservado=true e usa data_reservado como token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(reply(200, { success: true, data_reservado: '2026-09-27 10:00:00' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new LiveTicketReservationGateway(env).reserve(key)).resolves.toEqual({
      status: 'reserved',
      token: '2026-09-27 10:00:00',
    })
    expect(requestAt(fetchMock, 0)).toEqual({
      url: 'https://bilhetes.example/bilhete/reservado',
      method: 'PUT',
      body: { numero: '000123', concurso_id: 2026041, estabelecimento_id: 4734, reservado: true },
    })
  })

  it('traduz 409 da reserva em conflito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(409, { success: false })))

    await expect(new LiveTicketReservationGateway(env).reserve(key)).resolves.toEqual({
      status: 'conflict',
    })
  })

  it('libera enviando o token e reconhece perda de posse', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(200, { success: true }))
      .mockResolvedValueOnce(reply(409, { success: false }))
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new LiveTicketReservationGateway(env)

    expect(await gateway.release(key, '2026-09-27 10:00:00')).toBe('released')
    expect(await gateway.release(key, '2026-09-27 10:00:00')).toBe('not_owner')
    expect(requestAt(fetchMock, 0).body).toEqual({
      numero: '000123',
      concurso_id: 2026041,
      estabelecimento_id: 4734,
      reservado: false,
      data_reservado: '2026-09-27 10:00:00',
    })
  })

  it('lê reservado, data_reservado e validado vindos de colunas BIT', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply(200, {
        success: true,
        reservado: 1,
        data_reservado: '2026-09-27 10:00:00',
        validado: 0,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(new LiveTicketReservationGateway(env).inspect(key)).resolves.toEqual({
      reserved: true,
      token: '2026-09-27 10:00:00',
      validated: false,
    })
    const url = new URL(requestAt(fetchMock, 0).url)
    expect(url.pathname).toBe('/bilhete/reservado')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      concurso_id: '2026041',
      numero: '000123',
      estabelecimento_id: '4734',
    })
  })

  it('devolve null para bilhete inexistente e esconde falhas da API', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(reply(404, { success: false }))
        .mockResolvedValueOnce(reply(500, { error: 'SQLSTATE[HY000]' })),
    )
    const gateway = new LiveTicketReservationGateway(env)

    await expect(gateway.inspect(key)).resolves.toBeNull()
    await expect(gateway.reserve(key)).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    })
  })
})
