import { describe, expect, it } from 'vitest'
import { createRateLimiter } from './rate-limit.js'

describe('createRateLimiter', () => {
  it('libera novas consultas após a janela', () => {
    let current = 0
    const consume = createRateLimiter(1, 1_000, () => current)

    consume('ip')
    expect(() => consume('ip')).toThrow(expect.objectContaining({ statusCode: 429 }))
    expect(() => consume('outro-ip')).not.toThrow()
    current = 1_000
    expect(() => consume('ip')).not.toThrow()
  })
})
