import { z } from 'zod'
import type { ContestValues } from '../domain/types'

// Formulário trabalha com texto; valores monetários viram centavos inteiros sem ponto flutuante.
export function parsePriceToCents(value: string) {
  const match = /^\s*(\d{1,4})(?:[,.](\d{1,2}))?\s*$/.exec(value)
  if (!match) return null
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

export function formatCentsInput(cents: number) {
  return `${Math.trunc(cents / 100)},${String(cents % 100).padStart(2, '0')}`
}

export const contestFormSchema = z
  .object({
    salesStartAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Informe data e hora.'),
    salesEndAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Informe data e hora.'),
    drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.'),
    drawTime: z.string().regex(/^\d{2}:\d{2}$/, 'Informe a hora.'),
    price: z.string().refine((value) => {
      const cents = parsePriceToCents(value)
      return cents !== null && cents > 0
    }, 'Informe o valor, por exemplo 2,50.'),
    prizes: z
      .array(z.object({ value: z.string().trim().max(120, 'Use até 120 caracteres.') }))
      .refine(
        (prizes) => prizes.some(({ value }) => value.trim()),
        'Informe pelo menos um prêmio.',
      ),
    luckySpinsCount: z
      .string()
      .regex(/^\d{1,4}$/, 'Informe um número inteiro.')
      .refine((value) => Number(value) <= 1000, 'Use no máximo 1000.'),
    luckySpinsLabel: z.string().trim().max(40, 'Use até 40 caracteres.'),
    doubleChance: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.salesStartAt >= values.salesEndAt) {
      context.addIssue({
        code: 'custom',
        path: ['salesEndAt'],
        message: 'O fim das vendas precisa ser depois do início.',
      })
    }
    if (values.salesEndAt > `${values.drawDate}T${values.drawTime}`) {
      context.addIssue({
        code: 'custom',
        path: ['salesEndAt'],
        message: 'As vendas precisam terminar até o horário do sorteio.',
      })
    }
    if (Number(values.luckySpinsCount) > 0 && !values.luckySpinsLabel) {
      context.addIssue({
        code: 'custom',
        path: ['luckySpinsLabel'],
        message: 'Informe o valor dos giros.',
      })
    }
  })

export type ContestForm = z.infer<typeof contestFormSchema>

export const PRIZE_SLOTS = 5

export function toContestForm(values: ContestValues): ContestForm {
  return {
    salesStartAt: values.salesStartAt,
    salesEndAt: values.salesEndAt,
    drawDate: values.drawDate,
    drawTime: values.drawTime,
    price: formatCentsInput(values.priceInCents),
    prizes: Array.from({ length: PRIZE_SLOTS }, (_, index) => ({
      value: values.prizes[index] ?? '',
    })),
    luckySpinsCount: String(values.luckySpinsCount),
    luckySpinsLabel: values.luckySpinsLabel,
    doubleChance: values.doubleChance,
  }
}

export function fromContestForm(form: ContestForm): ContestValues {
  const spins = Number(form.luckySpinsCount)
  return {
    salesStartAt: form.salesStartAt,
    salesEndAt: form.salesEndAt,
    drawDate: form.drawDate,
    drawTime: form.drawTime,
    priceInCents: parsePriceToCents(form.price) ?? 0,
    prizes: form.prizes.map(({ value }) => value.trim()).filter(Boolean),
    luckySpinsCount: spins,
    luckySpinsLabel: spins > 0 ? form.luckySpinsLabel.trim() : '',
    doubleChance: form.doubleChance,
  }
}

export type SensitiveChange = { label: string; before: string; after: string }

// Preço e datas afetam cobrança e prazos de quem está comprando: exigem confirmação explícita.
export function sensitiveChanges(
  before: ContestValues,
  after: ContestValues,
  formatCurrency: (cents: number) => string,
): SensitiveChange[] {
  const local = (value: string) => value.replace('T', ' ').split(' ').map(formatPart).join(' ')
  const changes: SensitiveChange[] = []
  if (before.priceInCents !== after.priceInCents) {
    changes.push({
      label: 'Valor do bilhete',
      before: formatCurrency(before.priceInCents),
      after: formatCurrency(after.priceInCents),
    })
  }
  const dates: Array<[string, string, string]> = [
    ['Início das vendas', before.salesStartAt, after.salesStartAt],
    ['Fim das vendas', before.salesEndAt, after.salesEndAt],
    [
      'Data do sorteio',
      `${before.drawDate}T${before.drawTime}`,
      `${after.drawDate}T${after.drawTime}`,
    ],
  ]
  for (const [label, previous, next] of dates) {
    if (previous !== next) changes.push({ label, before: local(previous), after: local(next) })
  }
  return changes
}

function formatPart(part: string) {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(part)
  return date ? `${date[3]}/${date[2]}/${date[1]}` : part
}
