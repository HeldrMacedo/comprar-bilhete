import { DomainError } from '../shared/errors.js'

// Janela fixa em memória por chave (IP). Suficiente para uma instância; várias instâncias
// exigem armazenamento compartilhado.
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>()

  return function consume(key: string) {
    const current = now()
    for (const [entryKey, entry] of hits) {
      if (entry.resetAt <= current) hits.delete(entryKey)
    }
    const entry = hits.get(key) ?? { count: 0, resetAt: current + windowMs }
    entry.count += 1
    hits.set(key, entry)
    if (entry.count > limit) {
      throw new DomainError(
        'Muitas consultas em pouco tempo. Aguarde um minuto e tente novamente.',
        429,
        'RATE_LIMITED',
      )
    }
  }
}

// Conta só tentativas que falharam: login correto não consome o limite, mas força bruta trava.
export function createFailureLimiter(
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
) {
  const failures = new Map<string, { count: number; resetAt: number }>()

  function current(key: string) {
    const entry = failures.get(key)
    if (entry && entry.resetAt <= now()) {
      failures.delete(key)
      return undefined
    }
    return entry
  }

  return {
    assertAllowed(key: string) {
      if ((current(key)?.count ?? 0) >= limit) {
        throw new DomainError(
          'Muitas tentativas de login. Aguarde um minuto e tente novamente.',
          429,
          'RATE_LIMITED',
        )
      }
    },
    recordFailure(key: string) {
      for (const [entryKey, entry] of failures) {
        if (entry.resetAt <= now()) failures.delete(entryKey)
      }
      const entry = current(key) ?? { count: 0, resetAt: now() + windowMs }
      entry.count += 1
      failures.set(key, entry)
    },
  }
}
