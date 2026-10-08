import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseServerEnv } from '../../config/env.js'
import type { ContestValues } from './contest-admin-gateway.js'
import { LiveContestAdminGateway } from './live-contest-admin-gateway.js'

// Formato observado em GET /concurso/atual (08/10/2026).
const record = {
  id: 1,
  concurso_id_sorteiocap: 2026042,
  data_inicio_sorteiocap: '2026-09-05 08:52:00',
  data_fim_sorteiocap: '2026-10-07 19:00:00',
  data_sorteiocap: '2026-10-07',
  qte_premios_sorteiocap: 4,
  premio_01_sorteiocap: 'VALE COMPRAS 5 MIL REAIS',
  premio_02_sorteiocap: 'VALE COMPRAS 5 MIL REAIS',
  premio_03_sorteiocap: 'VALE COMPRAS 5 MIL REAIS',
  premio_04_sorteiocap: 'VALE COMPRAS 40 MIL REAIS',
  premio_05_sorteiocap: null,
  qtd_giros_sorteiocap: 20,
  giros_sorteiocap: 'R$: 500,00',
  dupla_chance_sorteiocap: 1,
  valor_bilhete_sorteiocap: 1.0,
  concurso_id_sorteioesp: 2026043,
  data_inicio_sorteioesp: '2026-09-10 12:46:46',
  data_fim_sorteioesp: '2026-10-11 08:00:00',
  data_sorteioesp: '2026-10-11',
  qte_premios_sorteioesp: 4,
  premio_01_sorteioesp: 'R$: 3 MIL REAIS ',
  premio_02_sorteioesp: 'R$: 3 MIL REAIS ',
  premio_03_sorteioesp: 'R$: 3 MIL REAIS ',
  premio_04_sorteioesp: '1 HONDA  BROS 160  0KM',
  premio_05_sorteioesp: null,
  qtd_giros_sorteioesp: 0,
  giros_sorteioesp: '0',
  dupla_chance_sorteioesp: 1,
  valor_bilhete_sorteioesp: 1.0,
  hora_sorteioesp: '09:00:00',
  hora_sorteiocap: '20:00:00',
}

const env = parseServerEnv({
  TICKET_PROVIDER: 'live',
  TICKET_API_BASE_URL: 'https://bilhetes.example',
})

const edited: ContestValues = {
  salesStartAt: '2026-10-12T08:00',
  salesEndAt: '2026-10-18T08:00',
  drawDate: '2026-10-18',
  drawTime: '09:00',
  priceInCents: 250,
  prizes: ['R$ 5 MIL', 'MOTO 0KM'],
  luckySpinsCount: 5,
  luckySpinsLabel: 'R$ 100,00',
  doubleChance: false,
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('LiveContestAdminGateway', () => {
  it('reads both contests from the shared record in local time', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([record])))

    const contests = await new LiveContestAdminGateway(env).listContests()

    expect(contests).toEqual([
      {
        source: 'cap',
        contestId: '2026042',
        salesStartAt: '2026-09-05T08:52',
        salesEndAt: '2026-10-07T19:00',
        drawDate: '2026-10-07',
        drawTime: '20:00',
        priceInCents: 100,
        prizes: [
          'VALE COMPRAS 5 MIL REAIS',
          'VALE COMPRAS 5 MIL REAIS',
          'VALE COMPRAS 5 MIL REAIS',
          'VALE COMPRAS 40 MIL REAIS',
        ],
        luckySpinsCount: 20,
        luckySpinsLabel: 'R$: 500,00',
        doubleChance: true,
      },
      expect.objectContaining({
        source: 'esp',
        contestId: '2026043',
        prizes: ['R$: 3 MIL REAIS', 'R$: 3 MIL REAIS', 'R$: 3 MIL REAIS', '1 HONDA BROS 160 0KM'],
        luckySpinsCount: 0,
        luckySpinsLabel: '',
      }),
    ])
  })

  it('sends the full record with only the edited contest changed and verifies it', async () => {
    let stored: Record<string, unknown> = { ...record }
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        stored = JSON.parse(String(init.body)) as Record<string, unknown>
        return json({ message: 'ok' })
      }
      return json([stored])
    })
    vi.stubGlobal('fetch', fetchMock)

    const saved = await new LiveContestAdminGateway(env).updateContest('esp', edited)

    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(put?.[0]).toBe('https://bilhetes.example/concurso/1')
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({
      ...record,
      data_inicio_sorteioesp: '2026-10-12 08:00:00',
      data_fim_sorteioesp: '2026-10-18 08:00:00',
      data_sorteioesp: '2026-10-18',
      hora_sorteioesp: '09:00:00',
      valor_bilhete_sorteioesp: 2.5,
      qte_premios_sorteioesp: 2,
      premio_01_sorteioesp: 'R$ 5 MIL',
      premio_02_sorteioesp: 'MOTO 0KM',
      premio_03_sorteioesp: null,
      premio_04_sorteioesp: null,
      premio_05_sorteioesp: null,
      qtd_giros_sorteioesp: 5,
      giros_sorteioesp: 'R$ 100,00',
      dupla_chance_sorteioesp: 0,
    })
    expect(saved).toEqual({ source: 'esp', contestId: '2026043', ...edited })
  })

  it('fails when the API accepts the PUT but does not apply it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === 'PUT' ? json({ message: 'ok' }) : json([record]),
      ),
    )

    await expect(
      new LiveContestAdminGateway(env).updateContest('cap', edited),
    ).rejects.toMatchObject({ code: 'UPSTREAM_NOT_APPLIED', statusCode: 502 })
  })

  it('refuses to edit a contest slot that is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json([{ ...record, concurso_id_sorteiocap: 2026000 }])),
    )

    await expect(
      new LiveContestAdminGateway(env).updateContest('cap', edited),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
