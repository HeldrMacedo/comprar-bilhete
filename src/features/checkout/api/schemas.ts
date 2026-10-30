import { z } from 'zod'

export const orderSchema = z.object({
  id: z.string().min(1),
  status: z.enum([
    'pending',
    'processing',
    'paid',
    'expired',
    'cancelled',
    'manual_review',
    'not_validated',
  ]),
  selectionMode: z.enum(['manual', 'random']).optional(),
  unitPriceInCents: z.number().int().positive().optional(),
  totalInCents: z.number().int().nonnegative(),
  refundDueInCents: z.number().int().positive().optional(),
  items: z
    .array(
      z.object({
        id: z.string(),
        code: z.string(),
        numbers: z.array(z.number()),
        secondChanceNumbers: z.array(z.number()).optional(),
        raffleId: z.string().min(1),
        raffleTitle: z.string().min(1),
        unitPriceInCents: z.number().int().positive(),
        salesEndAt: z.iso.datetime().optional(),
        validationStatus: z.literal('not_validated').optional(),
      }),
    )
    .optional(),
  receiptUrl: z.url().optional(),
  expiresAt: z.iso.datetime().optional(),
  message: z.string().optional(),
})

export const checkoutSchema = z.object({
  checkoutUrl: z.url(),
})
