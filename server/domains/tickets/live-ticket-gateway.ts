import { z } from 'zod'
import { fetchJson } from '../../shared/fetch-json.js'
import { DomainError } from '../../shared/errors.js'
import type { ServerEnv } from '../../config/env.js'
import type { Order, Ticket } from '../orders/order-types.js'
import type { Raffle, TicketGateway } from './ticket-gateway.js'

const contestSchema = z.object({
  concurso_id_sorteioesp: z.number().int().positive(),
  data_sorteioesp: z.string(),
  hora_sorteioesp: z.string(),
  qte_premios_sorteioesp: z.number().int().nonnegative(),
  premio_01_sorteioesp: z.string(),
  qtd_giros_sorteioesp: z.number().int().nonnegative(),
  giros_sorteioesp: z.string(),
  valor_bilhete_sorteioesp: z.number().positive(),
})

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
  constructor(private readonly env: ServerEnv) {}

  async getActiveRaffle(): Promise<Raffle> {
    const contest = await fetchJson(`${this.env.TICKET_API_BASE_URL}/concurso/atual`, contestSchema)
    const time = contest.hora_sorteioesp || '12:00:00'
    return {
      id: String(contest.concurso_id_sorteioesp),
      title: `Sorteio Especial #${contest.concurso_id_sorteioesp}`,
      description: `${contest.qte_premios_sorteioesp} prêmios e ${contest.qtd_giros_sorteioesp} giros da sorte.`,
      prize: contest.premio_01_sorteioesp || contest.giros_sorteioesp,
      drawDate: new Date(`${contest.data_sorteioesp}T${time}-03:00`).toISOString(),
      priceInCents: Math.round(contest.valor_bilhete_sorteioesp * 100),
    }
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
    for (const item of order.items) {
      if (!item.validationBatch || !item.batchPosition) {
        throw new DomainError('Cartela sem dados de validação da API externa.', 502)
      }
      await fetchJson(`${this.env.TICKET_API_BASE_URL}/bilhete/validar`, mutationResponseSchema, {
        method: 'PUT',
        body: JSON.stringify({
          numero: item.code,
          concurso_id: Number(order.raffleId),
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
