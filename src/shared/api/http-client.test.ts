import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiError, requestJson } from './http-client'

afterEach(() => vi.unstubAllGlobals())

describe('requestJson', () => {
  it('preserves a validated API error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Cartela reservada.', code: 'TICKET_RESERVED' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const error = await requestJson('/orders', z.object({ ok: z.literal(true) })).catch(
      (reason: unknown) => reason,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, code: 'TICKET_RESERVED' })
  })
})
