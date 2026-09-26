import { z } from 'zod'
import { fetchJson } from '../../shared/fetch-json.js'
import { DomainError } from '../../shared/errors.js'
import { hasTicketApiTls, requireTicketApiTls } from '../../shared/ticket-api-tls.js'
import type { ServerEnv } from '../../config/env.js'
import type { Order, Ticket } from '../orders/order-types.js'
import { currentContestsEnvelopeSchema, parseCurrentContests } from './current-contests.js'
import type { Raffle, TicketGateway } from './ticket-gateway.js'

const externalTicketSchema = z.object({
  numero: z.union([z.string(), z.number()]).transform(String),
  lote_validacao: z.union([z.string(), z.number()]).transform(String),
  posicao_lote: z.coerce.number().int().positive(),
  numeros: z.array(z.coerce.number().int().positive()).default([]),
})

const availableResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(externalTicketSchema),
})

const availableTicketResponseSchema = z.object({
  success: z.literal(true),
  data: z.union([externalTicketSchema, z.tuple([externalTicketSchema]).rest(externalTicketSchema)]),
})

const mutationResponseSchema = z
  .object({
    success: z.literal(true),
  })
  .passthrough()

export class LiveTicketGateway implements TicketGateway {
  constructor(
    private readonly env: ServerEnv,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getActiveRaffles() {
    const contests = await fetchJson(
      `${this.env.TICKET_API_BASE_URL}/concurso/atual`,
      currentContestsEnvelopeSchema,
    )
    return parseCurrentContests(contests, this.now()).map((raffle) => ({
      ...raffle,
      purchaseEnabled: hasTicketApiTls(
        this.env.TICKET_API_BASE_URL,
        this.env.TICKET_API_ALLOW_HTTP,
      ),
    }))
  }

  async getActiveRaffle(): Promise<Raffle> {
    const raffles = await this.getActiveRaffles()
    const raffle = raffles[0]
    if (!raffle) throw new DomainError('Nenhum concurso ativo encontrado.', 404, 'NO_ACTIVE_RAFFLE')
    return raffle
  }

  async getAvailableTickets(raffleId: string): Promise<Ticket[]> {
    const query = new URLSearchParams({
      concurso_id: raffleId,
      estabelecimento_id: this.env.TICKET_ESTABLISHMENT_ID,
      pagina: '1',
    })
    const response = await fetchJson(
      `${this.env.TICKET_API_BASE_URL}/bilhete/disponiveis?${query.toString()}`,
      availableResponseSchema,
    )
    return response.data.map(mapTicket)
  }

  async getAvailableTicket(raffleId: string, ticketId: string): Promise<Ticket | null> {
    const query = new URLSearchParams({
      concurso_id: raffleId,
      estabelecimento_id: this.env.TICKET_ESTABLISHMENT_ID,
      numero: ticketId,
    })
    const response = await fetch(
      `${this.env.TICKET_API_BASE_URL}/bilhete/disponivel/numero?${query.toString()}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      },
    ).catch(() => {
      throw new DomainError('Serviço externo indisponível.', 502, 'UPSTREAM_ERROR')
    })

    if (response.status === 404) return null
    if (!response.ok) {
      throw new DomainError('Serviço externo indisponível.', 502, 'UPSTREAM_ERROR')
    }

    const body: unknown = await response.json().catch(() => null)
    const parsed = availableTicketResponseSchema.safeParse(body)
    if (!parsed.success) {
      throw new DomainError(
        'Serviço externo respondeu fora do contrato esperado.',
        502,
        'UPSTREAM_SCHEMA',
      )
    }

    const ticket = Array.isArray(parsed.data.data) ? parsed.data.data[0] : parsed.data.data
    return mapTicket(ticket)
  }

  async fulfillOrder(order: Order) {
    requireTicketApiTls(this.env.TICKET_API_BASE_URL, this.env.TICKET_API_ALLOW_HTTP)
    for (const item of order.items) {
      if (!item.validationBatch || !item.batchPosition) {
        throw new DomainError('Cartela sem dados de validação da API externa.', 502)
      }
      await fetchJson(`${this.env.TICKET_API_BASE_URL}/bilhete/validar`, mutationResponseSchema, {
        method: 'PUT',
        body: JSON.stringify({
          numero: item.code,
          concurso_id: Number(item.raffleId ?? order.raffleId),
          lote_validacao: item.validationBatch,
          estabelecimento_id: Number(this.env.TICKET_ESTABLISHMENT_ID),
          posicao_lote: item.batchPosition,
        }),
      })
    }
  }
}

function mapTicket(ticket: z.infer<typeof externalTicketSchema>): Ticket {
  return {
    id: ticket.numero,
    code: ticket.numero,
    numbers: ticket.numeros,
    validationBatch: ticket.lote_validacao,
    batchPosition: ticket.posicao_lote,
  }
}
