import { z } from 'zod'

export const addressSchema = z.object({
  zipCode: z.string().regex(/^\d{8}$/),
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().optional(),
  neighborhood: z.string().min(1),
  city: z.string().min(1),
  state: z.string().regex(/^[A-Z]{2}$/),
})

export const externalCustomerSchema = z.object({
  externalId: z.string().min(1),
  name: z.string(),
  cpf: z.string(),
  phone: z.string(),
  address: addressSchema.optional(),
})

export const customerLookupSchema = z.discriminatedUnion('found', [
  z.object({ found: z.literal(false) }),
  z.object({ found: z.literal(true), customer: externalCustomerSchema }),
])

export const orderSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['pending', 'processing', 'paid', 'expired', 'cancelled', 'manual_review']),
  selectionMode: z.enum(['manual', 'random']).optional(),
  unitPriceInCents: z.number().int().positive().optional(),
  totalInCents: z.number().int().nonnegative(),
  items: z
    .array(
      z.object({
        id: z.string(),
        code: z.string(),
        numbers: z.array(z.number()),
        raffleId: z.string().min(1),
        raffleTitle: z.string().min(1),
        unitPriceInCents: z.number().int().positive(),
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
