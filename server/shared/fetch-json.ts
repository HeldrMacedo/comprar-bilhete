import type { z } from 'zod'
import { DomainError } from './errors.js'

export async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(10_000),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new DomainError(
      'Serviço externo indisponível.',
      response.status >= 500 ? 502 : response.status,
      'UPSTREAM_ERROR',
    )
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new DomainError(
      'Serviço externo respondeu fora do contrato esperado.',
      502,
      'UPSTREAM_SCHEMA',
    )
  }
  return parsed.data
}
