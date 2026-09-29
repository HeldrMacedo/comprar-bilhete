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
