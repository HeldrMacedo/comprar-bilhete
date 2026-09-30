import { z } from 'zod'
import { fetchJson } from '../../shared/fetch-json.js'
import { DomainError } from '../../shared/errors.js'
import { hasTicketApiTls, requireTicketApiTls } from '../../shared/ticket-api-tls.js'
import type { ServerEnv } from '../../config/env.js'
import type { Order, Ticket } from '../orders/order-types.js'
import { currentContestsEnvelopeSchema, parseCurrentContests } from './current-contests.js'
import { bitSchema, parseTicketApiDateTime } from './ticket-api-fields.js'
import type { Raffle, TicketGateway } from './ticket-gateway.js'

const pipedNumbersSchema = z
  .string()
  .transform((value) => value.split('|').filter(Boolean).map(Number))
  .pipe(z.array(z.number().int().positive()))

const externalTicketSchema = z
  .object({
    numero: z.union([z.string(), z.number()]).transform(String),
    lote_validacao: z.union([z.string(), z.number()]).transform(String),
    posicao_lote: z.coerce.number().int().nonnegative(),
    numeros: z.array(z.coerce.number().int().positive()).optional(),
    dezenas: pipedNumbersSchema.optional(),
    reservado: bitSchema.optional(),
    data_reservado: z.string().nullable().optional(),
    validado: bitSchema.optional(),
  })
  .transform(({ numeros, dezenas, ...ticket }) => ({
    ...ticket,
    numeros: numeros ?? dezenas ?? [],
  }))

const availableResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(externalTicketSchema),
})

const availableTicketResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    disponivel: z.boolean(),
    bilhete: externalTicketSchema,
  }),
  z.object({
    success: z.literal(true),
    data: z.union([
      externalTicketSchema,
      z.tuple([externalTicketSchema]).rest(externalTicketSchema),
    ]),
  }),
])

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
    return response.data.filter((ticket) => this.isOffered(ticket)).map(mapTicket)
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

    if ('bilhete' in parsed.data) {
      return parsed.data.disponivel && this.isOffered(parsed.data.bilhete)
        ? mapTicket(parsed.data.bilhete)
        : null
    }
    const ticket = Array.isArray(parsed.data.data) ? parsed.data.data[0] : parsed.data.data
    return this.isOffered(ticket) ? mapTicket(ticket) : null
  }

  private isOffered(ticket: z.output<typeof externalTicketSchema>) {
    if (ticket.validado) return false
    if (!ticket.reservado) return true
    if (!ticket.data_reservado) return false
    const reservedFor = this.now().getTime() - parseTicketApiDateTime(ticket.data_reservado)
    return reservedFor >= this.env.TICKET_RESERVATION_TTL_MINUTES * 60_000
  }

  async fulfillOrder(order: Order) {
    requireTicketApiTls(this.env.TICKET_API_BASE_URL, this.env.TICKET_API_ALLOW_HTTP)
    const personId = Number(order.customer.externalId)
    if (!Number.isSafeInteger(personId) || personId <= 0) {
      throw new DomainError('Pessoa sem cadastro na API externa.', 502, 'CUSTOMER_NOT_REGISTERED')
    }
    const holderName = order.customer.beneficiaryName ?? order.customer.name
    for (const item of order.items) {
      if (
        !item.validationBatch ||
        typeof item.batchPosition !== 'number' ||
        item.batchPosition < 0
      ) {
        throw new DomainError('Cartela sem dados de validacao sequencial.', 502)
      }
      await fetchJson(`${this.env.TICKET_API_BASE_URL}/bilhete/validar`, mutationResponseSchema, {
        method: 'PUT',
        body: JSON.stringify({
          numero: item.code,
          concurso_id: Number(item.raffleId ?? order.raffleId),
          lote_validacao: item.validationBatch,
          estabelecimento_id: Number(this.env.TICKET_ESTABLISHMENT_ID),
          posicao_lote: item.batchPosition,
          pessoas_id: personId,
          nome: holderName,
        }),
      })
    }
  }
}

function mapTicket(ticket: z.output<typeof externalTicketSchema>): Ticket {
  return {
    id: ticket.numero,
    code: ticket.numero,
    numbers: ticket.numeros,
    validationBatch: ticket.lote_validacao,
    batchPosition: ticket.posicao_lote,
  }
}
