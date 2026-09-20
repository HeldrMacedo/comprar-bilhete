import { z } from 'zod'

export const orderSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['pending', 'processing', 'paid', 'expired', 'cancelled', 'manual_review']),
  totalInCents: z.number().int().nonnegative(),
  receiptUrl: z.url().optional(),
  expiresAt: z.iso.datetime().optional(),
  message: z.string().optional(),
})

export const checkoutSchema = z.object({
  checkoutUrl: z.url(),
})
