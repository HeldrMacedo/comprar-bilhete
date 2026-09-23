import { z } from 'zod'
import { env } from '../config/env'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown }

export async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${env.VITE_API_BASE_URL}${path}`, {
      ...options,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  } catch (error) {
    throw new ApiError(
      'Nao foi possivel conectar ao servidor. Tente novamente.',
      undefined,
      undefined,
      error,
    )
  }

  if (!response.ok) {
    const apiError = await readApiError(response)
    throw new ApiError(apiError.message, response.status, apiError.code)
  }

  const data: unknown = await response.json()
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    console.error('Resposta fora do contrato', parsed.error.flatten())
    throw new ApiError(
      'O servidor respondeu em um formato inesperado.',
      response.status,
      undefined,
      parsed.error,
    )
  }
  return parsed.data
}

const errorBodySchema = z.object({
  message: z.string().optional(),
  code: z.string().regex(/^[A-Z0-9_]{1,64}$/).optional(),
})

async function readApiError(response: Response): Promise<{ message: string; code?: string }> {
  try {
    const parsed = errorBodySchema.safeParse(await response.json())
    if (parsed.success && parsed.data.message) {
      return { message: parsed.data.message, code: parsed.data.code }
    }
  } catch {
    // Non-JSON responses receive a safe message below.
  }
  if (response.status === 409) {
    return { message: 'Uma ou mais cartelas acabaram de ser reservadas.' }
  }
  if (response.status >= 500) {
    return { message: 'O servidor esta temporariamente indisponivel.' }
  }
  return { message: 'Nao foi possivel concluir a solicitacao.' }
}
