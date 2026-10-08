import { z } from 'zod'

// "cap" é o sorteio de quarta e "esp" o de domingo; os dois vivem no mesmo registro da API.
export const contestSourceSchema = z.enum(['cap', 'esp'])
export type ContestSource = z.infer<typeof contestSourceSchema>

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Use data e hora no formato AAAA-MM-DDTHH:MM.')

export const contestValuesSchema = z
  .object({
    salesStartAt: localDateTime,
    salesEndAt: localDateTime,
    drawDate: z.iso.date(),
    drawTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use a hora no formato HH:MM.'),
    priceInCents: z.number().int().min(1).max(100_000),
    prizes: z
      .array(z.string().trim().min(1, 'Prêmio vazio.').max(120))
      .min(1, 'Informe pelo menos um prêmio.')
      .max(5, 'A API de bilhetes aceita até 5 prêmios.'),
    luckySpinsCount: z.number().int().min(0).max(1000),
    luckySpinsLabel: z.string().trim().max(40),
    doubleChance: z.boolean(),
  })
  .strict()
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
    if (values.luckySpinsCount > 0 && !values.luckySpinsLabel) {
      context.addIssue({
        code: 'custom',
        path: ['luckySpinsLabel'],
        message: 'Informe o valor dos giros.',
      })
    }
  })

export type ContestValues = z.infer<typeof contestValuesSchema>

// Datas e horas locais de America/Fortaleza, sem fuso, como a API de bilhetes guarda.
export type ContestSlot = ContestValues & { source: ContestSource; contestId: string }

export interface ContestAdminGateway {
  listContests(): Promise<ContestSlot[]>
  updateContest(source: ContestSource, values: ContestValues): Promise<ContestSlot>
}
