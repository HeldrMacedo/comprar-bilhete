import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { parseServerEnv } from '../config/env.js'
import { parseYoutubeVideoId } from '../domains/admin/site-settings.js'
import { ADMIN_SESSION_COOKIE } from './admin-routes.js'

const PASSWORD = 'senha-segura-123'
const ORIGIN = 'http://localhost:5173'
const apps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

async function setup() {
  const app = await buildApp({
    env: parseServerEnv({
      DATABASE_PATH: ':memory:',
      PUBLIC_APP_URL: ORIGIN,
      ADMIN_BOOTSTRAP_LOGIN: 'admin',
      ADMIN_BOOTSTRAP_PASSWORD: PASSWORD,
    }),
    logger: false,
    startWorker: false,
  })
  apps.push(app)
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/session',
    payload: { login: 'admin', password: PASSWORD },
  })
  const cookie = login.cookies.find(({ name }) => name === ADMIN_SESSION_COOKIE)
  return { app, headers: { cookie: `${ADMIN_SESSION_COOKIE}=${cookie?.value}`, origin: ORIGIN } }
}

const values = {
  salesStartAt: '2026-10-01T08:00',
  salesEndAt: '2026-10-14T19:00',
  drawDate: '2026-10-14',
  drawTime: '20:00',
  priceInCents: 1500,
  prizes: ['MOTO 0KM', 'R$ 2 MIL'],
  luckySpinsCount: 0,
  luckySpinsLabel: '',
  doubleChance: true,
}

describe('admin raffles', () => {
  it('lists contests, edits one and the public site reflects it', async () => {
    const { app, headers } = await setup()

    const list = await app.inject({ method: 'GET', url: '/api/v1/admin/raffles', headers })
    expect(
      list.json<{ raffles: Array<{ source: string }> }>().raffles.map((r) => r.source),
    ).toEqual(['cap', 'esp'])

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/raffles/cap',
      headers,
      payload: values,
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.json()).toMatchObject({ raffle: { source: 'cap', ...values } })

    const active = await app.inject({ method: 'GET', url: '/api/v1/raffles/active' })
    expect(active.json()).toContainEqual(
      expect.objectContaining({
        id: 'sorteio-setembro',
        priceInCents: 1500,
        prizes: ['MOTO 0KM', 'R$ 2 MIL'],
        drawDate: '2026-10-14T23:00:00.000Z',
        salesEndAt: '2026-10-14T22:00:00.000Z',
      }),
    )
  })

  it('rejects inconsistent dates, more than five prizes and unknown contests', async () => {
    const { app, headers } = await setup()
    const put = (url: string, payload: object) =>
      app.inject({ method: 'PUT', url, headers, payload })

    expect(
      (await put('/api/v1/admin/raffles/cap', { ...values, salesEndAt: '2026-10-14T21:00' }))
        .statusCode,
    ).toBe(400)
    expect(
      (
        await put('/api/v1/admin/raffles/cap', {
          ...values,
          prizes: ['a', 'b', 'c', 'd', 'e', 'f'],
        })
      ).statusCode,
    ).toBe(400)
    expect((await put('/api/v1/admin/raffles/xyz', values)).statusCode).toBe(400)
    expect(
      (await put('/api/v1/admin/raffles/cap', { ...values, priceInCents: 10.5 })).statusCode,
    ).toBe(400)
  })
})

describe('site settings', () => {
  it('extracts the video ID only from YouTube links', () => {
    expect(parseYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe(
      'dQw4w9WgXcQ',
    )
    expect(parseYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('dQw4w9WgXcQ')
    expect(parseYoutubeVideoId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYoutubeVideoId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYoutubeVideoId('')).toBeNull()
    for (const invalid of [
      'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://evil.example/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=<script>',
      'javascript:alert(1)',
    ]) {
      expect(() => parseYoutubeVideoId(invalid)).toThrow('Informe um link de vídeo do YouTube')
    }
  })

  it('saves the video from the admin and exposes only the ID publicly', async () => {
    const { app, headers } = await setup()
    const empty = await app.inject({ method: 'GET', url: '/api/v1/site-settings' })
    expect(empty.json()).toEqual({ youtubeVideoId: null })

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings',
      headers,
      payload: { youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' },
    })
    expect(saved.json()).toEqual({
      youtubeVideoId: 'dQw4w9WgXcQ',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    })
    expect((await app.inject({ method: 'GET', url: '/api/v1/site-settings' })).json()).toEqual({
      youtubeVideoId: 'dQw4w9WgXcQ',
    })

    const invalid = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings',
      headers,
      payload: { youtubeUrl: 'https://vimeo.com/123' },
    })
    expect(invalid.statusCode).toBe(400)

    await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings',
      headers,
      payload: { youtubeUrl: '' },
    })
    expect((await app.inject({ method: 'GET', url: '/api/v1/site-settings' })).json()).toEqual({
      youtubeVideoId: null,
    })
  })

  it('requires a session to change settings', async () => {
    const { app } = await setup()
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings',
      payload: { youtubeUrl: '' },
    })
    expect(response.statusCode).toBe(401)
  })
})
