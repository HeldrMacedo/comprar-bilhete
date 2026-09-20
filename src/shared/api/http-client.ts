import { z } from 'zod'
import { env } from '../config/env'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
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
    throw new ApiError('Não foi possível conectar ao servidor. Tente novamente.', undefined, error)
  }

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }

  const data: unknown = await response.json()
  const parsed = schema.safeParse(data)

  if (!parsed.success) {
    console.error('Resposta fora do contrato', parsed.error.flatten())
    throw new ApiError(
      'O servidor respondeu em um formato inesperado.',
      response.status,
      parsed.error,
    )
  }

  return parsed.data
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown }
    if (typeof body.message === 'string') return body.message
  } catch {
    // A resposta pode não ser JSON; a mensagem segura abaixo é suficiente.
  }

  if (response.status === 409) return 'Uma ou mais cartelas acabaram de ser reservadas.'
  if (response.status >= 500) return 'O servidor está temporariamente indisponível.'
  return 'Não foi possível concluir a solicitação.'
}
