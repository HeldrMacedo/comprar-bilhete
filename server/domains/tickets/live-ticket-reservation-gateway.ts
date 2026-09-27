import { z } from 'zod'
import type { ServerEnv } from '../../config/env.js'
import { DomainError } from '../../shared/errors.js'
import { bitSchema } from './ticket-api-fields.js'
import type {
  ReleaseResult,
  ReservationSnapshot,
  ReserveResult,
  TicketReservationGateway,
  TicketReservationKey,
} from './ticket-reservation-gateway.js'

// Contrato provisório: a API de bilhetes ainda não publicou estes endpoints.
// Ajuste caminho e campos somente aqui quando o contrato oficial existir.
const RESERVATION_PATH = '/bilhete/reservado'

const reserveResponseSchema = z.object({
  success: z.literal(true),
  data_reservado: z.string().min(1),
})

const releaseResponseSchema = z.object({ success: z.literal(true) }).passthrough()

const inspectResponseSchema = z.object({
  success: z.literal(true),
  reservado: bitSchema,
  data_reservado: z.string().min(1).nullable(),
  validado: bitSchema,
})

type UpstreamResponse = { status: number; body: unknown }

export class LiveTicketReservationGateway implements TicketReservationGateway {
  constructor(private readonly env: ServerEnv) {}

  async reserve(key: TicketReservationKey): Promise<ReserveResult> {
    const response = await this.request('PUT', RESERVATION_PATH, {
      ...this.identify(key),
      reservado: true,
    })
    if (response.status === 409) return { status: 'conflict' }
    const body = parseSuccess(reserveResponseSchema, response)
    return { status: 'reserved', token: body.data_reservado }
  }

  async release(key: TicketReservationKey, token: string): Promise<ReleaseResult> {
    const response = await this.request('PUT', RESERVATION_PATH, {
      ...this.identify(key),
      reservado: false,
      data_reservado: token,
    })
    if (response.status === 409) return 'not_owner'
    parseSuccess(releaseResponseSchema, response)
    return 'released'
  }

  async inspect(key: TicketReservationKey): Promise<ReservationSnapshot | null> {
    const query = new URLSearchParams({
      concurso_id: key.raffleId,
      numero: key.ticketNumber,
      estabelecimento_id: this.env.TICKET_ESTABLISHMENT_ID,
    })
    const response = await this.request('GET', `${RESERVATION_PATH}?${query.toString()}`)
    if (response.status === 404) return null
    const body = parseSuccess(inspectResponseSchema, response)
    return { reserved: body.reservado, token: body.data_reservado, validated: body.validado }
  }

  private identify(key: TicketReservationKey) {
    return {
      numero: key.ticketNumber,
      concurso_id: Number(key.raffleId),
      estabelecimento_id: Number(this.env.TICKET_ESTABLISHMENT_ID),
    }
  }

  private async request(
    method: 'GET' | 'PUT',
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<UpstreamResponse> {
    const response = await fetch(`${this.env.TICKET_API_BASE_URL}${path}`, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      throw upstreamError()
    })
    const body: unknown = await response.json().catch(() => null)
    return { status: response.status, body }
  }
}

function parseSuccess<T>(schema: z.ZodType<T>, response: UpstreamResponse): T {
  if (response.status < 200 || response.status >= 300) throw upstreamError()
  const parsed = schema.safeParse(response.body)
  if (!parsed.success) {
    throw new DomainError(
      'Serviço externo respondeu fora do contrato esperado.',
      502,
      'UPSTREAM_SCHEMA',
    )
  }
  return parsed.data
}

function upstreamError() {
  return new DomainError('Serviço externo indisponível.', 502, 'UPSTREAM_ERROR')
}
