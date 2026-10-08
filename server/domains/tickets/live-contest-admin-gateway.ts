import { z } from 'zod'
import type { ServerEnv } from '../../config/env.js'
import { DomainError } from '../../shared/errors.js'
import { fetchJson } from '../../shared/fetch-json.js'
import type {
  ContestAdminGateway,
  ContestSlot,
  ContestSource,
  ContestValues,
} from './contest-admin-gateway.js'

const SUFFIX: Record<ContestSource, string> = { cap: 'sorteiocap', esp: 'sorteioesp' }
const PRIZE_SLOTS = 5

const recordSchema = z
  .object({ id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]) })
  .passthrough()
const envelopeSchema = z.union([
  recordSchema,
  z.tuple([recordSchema]).transform(([record]) => record),
])
const anyResponseSchema = z.unknown()

const dateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/)

function slotSchema(suffix: string) {
  return z.object({
    [`concurso_id_${suffix}`]: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
    [`data_inicio_${suffix}`]: dateTimeSchema,
    [`data_fim_${suffix}`]: dateTimeSchema,
    [`data_${suffix}`]: z.iso.date(),
    [`hora_${suffix}`]: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/)
      .nullish(),
    [`valor_bilhete_${suffix}`]: z.number().positive(),
    [`qtd_giros_${suffix}`]: z.number().int().nonnegative().nullish(),
    [`giros_${suffix}`]: z.string().nullish(),
    [`dupla_chance_${suffix}`]: z.union([z.literal(0), z.literal(1), z.boolean()]).nullish(),
    ...Object.fromEntries(
      Array.from({ length: PRIZE_SLOTS }, (_, index) => [
        `premio_0${index + 1}_${suffix}`,
        z.string().nullish(),
      ]),
    ),
  })
}

function toLocal(value: string) {
  return value.slice(0, 16).replace(' ', 'T')
}

function toCents(value: number) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value))
  if (!match) throw upstreamSchema()
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

// A API guarda o valor como DECIMAL; o painel trabalha em centavos inteiros.
function toDecimal(cents: number) {
  return Number(`${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`)
}

function upstreamSchema() {
  return new DomainError(
    'Serviço externo respondeu fora do contrato esperado.',
    502,
    'UPSTREAM_SCHEMA',
  )
}

export function readContestSlot(
  record: Record<string, unknown>,
  source: ContestSource,
): ContestSlot | null {
  const suffix = SUFFIX[source]
  const contestId = record[`concurso_id_${suffix}`]
  if (contestId === null || contestId === undefined || String(contestId).endsWith('000')) {
    return null
  }
  const parsed = slotSchema(suffix).safeParse(record)
  if (!parsed.success) throw upstreamSchema()
  const slot = parsed.data as Record<string, unknown>
  const text = (name: string) => {
    const value = slot[`${name}_${suffix}`]
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  }
  const spins = slot[`qtd_giros_${suffix}`]
  const double = slot[`dupla_chance_${suffix}`]
  const hour = text('hora') || '12:00'
  return {
    source,
    contestId: String(contestId),
    salesStartAt: toLocal(text('data_inicio')),
    salesEndAt: toLocal(text('data_fim')),
    drawDate: text('data'),
    drawTime: hour.slice(0, 5),
    priceInCents: toCents(slot[`valor_bilhete_${suffix}`] as number),
    prizes: Array.from({ length: PRIZE_SLOTS }, (_, index) => text(`premio_0${index + 1}`)).filter(
      Boolean,
    ),
    luckySpinsCount: typeof spins === 'number' ? spins : 0,
    luckySpinsLabel: typeof spins === 'number' && spins > 0 ? text('giros') : '',
    doubleChance: double === 1 || double === true,
  }
}

export function toContestPatch(source: ContestSource, values: ContestValues) {
  const suffix = SUFFIX[source]
  return {
    [`data_inicio_${suffix}`]: `${values.salesStartAt.replace('T', ' ')}:00`,
    [`data_fim_${suffix}`]: `${values.salesEndAt.replace('T', ' ')}:00`,
    [`data_${suffix}`]: values.drawDate,
    [`hora_${suffix}`]: `${values.drawTime}:00`,
    [`valor_bilhete_${suffix}`]: toDecimal(values.priceInCents),
    [`qte_premios_${suffix}`]: values.prizes.length,
    ...Object.fromEntries(
      Array.from({ length: PRIZE_SLOTS }, (_, index) => [
        `premio_0${index + 1}_${suffix}`,
        values.prizes[index] ?? null,
      ]),
    ),
    [`qtd_giros_${suffix}`]: values.luckySpinsCount,
    [`giros_${suffix}`]: values.luckySpinsCount > 0 ? values.luckySpinsLabel : '0',
    [`dupla_chance_${suffix}`]: values.doubleChance ? 1 : 0,
  }
}

export class LiveContestAdminGateway implements ContestAdminGateway {
  constructor(private readonly env: ServerEnv) {}

  async listContests() {
    const record = await this.readRecord()
    return (['cap', 'esp'] as const)
      .map((source) => readContestSlot(record, source))
      .filter((slot): slot is ContestSlot => slot !== null)
  }

  // O swagger não documenta o corpo do PUT: envia o registro completo, com só os campos do
  // sorteio alterados, e relê para confirmar que a API aplicou a mudança.
  async updateContest(source: ContestSource, values: ContestValues) {
    const record = await this.readRecord()
    if (!readContestSlot(record, source)) {
      throw new DomainError('Este sorteio não está disponível para edição.', 404)
    }
    await fetchJson(
      `${this.env.TICKET_API_BASE_URL}/concurso/${encodeURIComponent(String(record.id))}`,
      anyResponseSchema,
      { method: 'PUT', body: JSON.stringify({ ...record, ...toContestPatch(source, values) }) },
    )

    const saved = readContestSlot(await this.readRecord(), source)
    if (!saved || JSON.stringify(normalize(saved)) !== JSON.stringify(normalize(values))) {
      throw new DomainError(
        'A API de bilhetes não confirmou a alteração. Confira o sorteio antes de tentar de novo.',
        502,
        'UPSTREAM_NOT_APPLIED',
      )
    }
    return saved
  }

  private async readRecord() {
    return fetchJson(`${this.env.TICKET_API_BASE_URL}/concurso/atual`, envelopeSchema)
  }
}

function normalize(values: ContestValues): ContestValues {
  return {
    salesStartAt: values.salesStartAt,
    salesEndAt: values.salesEndAt,
    drawDate: values.drawDate,
    drawTime: values.drawTime,
    priceInCents: values.priceInCents,
    prizes: values.prizes.map((prize) => prize.replace(/\s+/g, ' ').trim()),
    luckySpinsCount: values.luckySpinsCount,
    luckySpinsLabel: values.luckySpinsCount > 0 ? values.luckySpinsLabel : '',
    doubleChance: values.doubleChance,
  }
}
