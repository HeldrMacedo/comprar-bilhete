import { z } from 'zod'

export const raffleCardSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  numbers: z.array(z.number().int().positive()).min(1),
  secondChanceNumbers: z.array(z.number().int().positive()).optional(),
  available: z.boolean(),
})

export const raffleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  prize: z.string().min(1),
  drawDate: z.string().datetime(),
  priceInCents: z.number().int().positive(),
  prizes: z.array(z.string().min(1)).optional(),
  luckySpins: z.object({ count: z.number().int().positive(), label: z.string() }).optional(),
  doubleChance: z.boolean().optional(),
  purchaseEnabled: z.boolean().optional(),
  cards: z.array(raffleCardSchema),
})

export const raffleSummarySchema = raffleSchema.omit({ cards: true })
export const activeRafflesSchema = z.array(raffleSummarySchema)
export const cardsSchema = z.array(raffleCardSchema)
