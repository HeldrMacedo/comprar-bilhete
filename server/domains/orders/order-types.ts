import { z } from 'zod'

export const customerSchema = z.object({
  name: z.string().trim().min(3).max(120),
  cpf: z.string().regex(/^\d{11}$/),
  phone: z.string().regex(/^\+55\d{11}$/),
})

export const ticketSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  numbers: z.array(z.number().int().positive()),
  validationBatch: z.string().optional(),
  batchPosition: z.number().int().positive().optional(),
})

export const orderStatusSchema = z.enum([
  'pending',
  'processing',
  'paid',
  'expired',
  'cancelled',
  'manual_review',
])

export const orderSchema = z.object({
  id: z.string().uuid(),
  raffleId: z.string().min(1),
  raffleTitle: z.string().min(1),
  status: orderStatusSchema,
  totalInCents: z.number().int().positive(),
  customer: customerSchema,
  items: z.array(ticketSchema).min(1),
  checkoutUrl: z.url().optional(),
  receiptUrl: z.url().optional(),
  transactionNsu: z.string().optional(),
  invoiceSlug: z.string().optional(),
  lastError: z.string().optional(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  paidAt: z.iso.datetime().optional(),
})

export const createOrderInputSchema = z.object({
  raffleId: z.string().min(1),
  cardIds: z.array(z.string().min(1)).min(1).max(50),
  customer: customerSchema,
})

export const paymentEventSchema = z.object({
  invoice_slug: z.string().min(1),
  amount: z.number().int().positive(),
  paid_amount: z.number().int().positive(),
  installments: z.number().int().positive(),
  capture_method: z.string().min(1),
  transaction_nsu: z.string().min(1),
  order_nsu: z.string().uuid(),
  receipt_url: z.url(),
  items: z.array(z.unknown()).default([]),
})

export type Customer = z.infer<typeof customerSchema>
export type Ticket = z.infer<typeof ticketSchema>
export type Order = z.infer<typeof orderSchema>
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>
export type PaymentEvent = z.infer<typeof paymentEventSchema>
