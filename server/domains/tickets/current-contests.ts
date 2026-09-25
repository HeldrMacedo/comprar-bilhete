import { z } from 'zod'
import { DomainError } from '../../shared/errors.js'
import type { Raffle } from './ticket-gateway.js'

export type CurrentRaffle = Raffle & { source: 'cap' | 'esp'; salesEndAt: string }

const contestIdSchema = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
  .transform(String)

const salesEndSchema = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)

const currentContestsObjectSchema = z
  .object({
    concurso_id_sorteiocap: contestIdSchema.nullish(),
    concurso_id_sorteioesp: contestIdSchema.nullish(),
  })
  .passthrough()

export const currentContestsEnvelopeSchema = z.union([
  currentContestsObjectSchema,
  z.tuple([currentContestsObjectSchema]).transform(([contests]) => contests),
])

const capSchema = z.object({
  concurso_id_sorteiocap: contestIdSchema,
  data_sorteiocap: z.iso.date(),
  data_fim_sorteiocap: salesEndSchema,
  hora_sorteiocap: z
    .string()
    .regex(/^\d{2}:\d{2}:\d{2}$/)
    .default('12:00:00'),
  qte_premios_sorteiocap: z.number().int().nonnegative(),
  qtd_giros_sorteiocap: z.number().int().nonnegative(),
  giros_sorteiocap: z.string().nullish(),
  premio_01_sorteiocap: z.string().nullish(),
  valor_bilhete_sorteiocap: z.number().positive(),
})

const espSchema = z.object({
  concurso_id_sorteioesp: contestIdSchema,
  data_sorteioesp: z.iso.date(),
  data_fim_sorteioesp: salesEndSchema,
  hora_sorteioesp: z
    .string()
    .regex(/^\d{2}:\d{2}:\d{2}$/)
    .default('12:00:00'),
  qte_premios_sorteioesp: z.number().int().nonnegative(),
  qtd_giros_sorteioesp: z.number().int().nonnegative(),
  giros_sorteioesp: z.string().nullish(),
  premio_01_sorteioesp: z.string().nullish(),
  valor_bilhete_sorteioesp: z.number().positive(),
})

export function parseCurrentContests(input: unknown, now = new Date()): CurrentRaffle[] {
  const envelope = currentContestsEnvelopeSchema.safeParse(input)
  if (!envelope.success) throw invalidUpstream()

  const raffles: CurrentRaffle[] = []
  const { concurso_id_sorteiocap: capId, concurso_id_sorteioesp: espId } = envelope.data
  const source = envelope.data

  if (capId && !capId.endsWith('000')) {
    const deadline = z.object({ data_fim_sorteiocap: salesEndSchema }).safeParse(source)
    if (!deadline.success) throw invalidUpstream()
    const salesEndAt = toSalesEnd(deadline.data.data_fim_sorteiocap)
    if (new Date(salesEndAt).getTime() > now.getTime()) {
      const parsed = capSchema.safeParse(source)
      if (!parsed.success) throw invalidUpstream()
      const cap = parsed.data
      raffles.push({
        id: cap.concurso_id_sorteiocap,
        source: 'cap',
        salesEndAt,
        title: `Sorteio CAP #${cap.concurso_id_sorteiocap}`,
        description: `${cap.qte_premios_sorteiocap} prêmios e ${cap.qtd_giros_sorteiocap} giros da sorte.`,
        prize: cap.premio_01_sorteiocap || cap.giros_sorteiocap || 'Prêmios a confirmar',
        drawDate: toDrawDate(cap.data_sorteiocap, cap.hora_sorteiocap),
        priceInCents: toCents(cap.valor_bilhete_sorteiocap),
      })
    }
  }

  if (espId && !espId.endsWith('000')) {
    const deadline = z.object({ data_fim_sorteioesp: salesEndSchema }).safeParse(source)
    if (!deadline.success) throw invalidUpstream()
    const salesEndAt = toSalesEnd(deadline.data.data_fim_sorteioesp)
    if (new Date(salesEndAt).getTime() > now.getTime()) {
      const parsed = espSchema.safeParse(source)
      if (!parsed.success) throw invalidUpstream()
      const esp = parsed.data
      raffles.push({
        id: esp.concurso_id_sorteioesp,
        source: 'esp',
        salesEndAt,
        title: `Sorteio Especial #${esp.concurso_id_sorteioesp}`,
        description: `${esp.qte_premios_sorteioesp} prêmios e ${esp.qtd_giros_sorteioesp} giros da sorte.`,
        prize: esp.premio_01_sorteioesp || esp.giros_sorteioesp || 'Prêmios a confirmar',
        drawDate: toDrawDate(esp.data_sorteioesp, esp.hora_sorteioesp),
        priceInCents: toCents(esp.valor_bilhete_sorteioesp),
      })
    }
  }

  return raffles
}

function toDrawDate(date: string, time: string): string {
  const drawDate = new Date(`${date}T${time}-03:00`)
  if (Number.isNaN(drawDate.getTime())) throw invalidUpstream()
  return drawDate.toISOString()
}

function toSalesEnd(value: string): string {
  const salesEnd = new Date(`${value.replace(' ', 'T')}-03:00`)
  if (Number.isNaN(salesEnd.getTime())) throw invalidUpstream()
  return salesEnd.toISOString()
}

function toCents(value: number): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value))
  if (!match) throw invalidUpstream()
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents <= 0) throw invalidUpstream()
  return cents
}

function invalidUpstream() {
  return new DomainError(
    'Serviço externo respondeu fora do contrato esperado.',
    502,
    'UPSTREAM_SCHEMA',
  )
}
