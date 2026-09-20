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
      estabelecimento_id: this.env.TICKET_ESTABLISHMENT_ID!,
      pagina: '1',
    })
    const response = await fetchJson(
      `${this.env.TICKET_API_BASE_URL}/bilhete/disponiveis?${query.toString()}`,
      availableResponseSchema,
    )
    return response.data.map((ticket) => ({
      id: ticket.numero,
      code: ticket.numero,
      numbers: ticket.numeros,
      validationBatch: ticket.lote_validacao,
      batchPosition: ticket.posicao_lote,
    }))
  }

  async fulfillOrder(order: Order) {
    await this.ensurePerson(order)
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

  private async ensurePerson(order: Order) {
    const lookup = await fetch(
      `${this.env.TICKET_API_BASE_URL}/pessoa/cpf/${encodeURIComponent(order.customer.cpf)}`,
      { signal: AbortSignal.timeout(10_000) },
    )
    if (lookup.ok) return
    if (lookup.status !== 404) throw new DomainError('Falha ao consultar participante.', 502)

    await fetchJson(`${this.env.TICKET_API_BASE_URL}/pessoa`, mutationResponseSchema, {
      method: 'POST',
      body: JSON.stringify({
        nome: order.customer.name,
        cpf: order.customer.cpf,
        fone: order.customer.phone.replace('+55', ''),
      }),
    })
  }
}
