import { z } from 'zod'
import {
  customerInputSchema,
  resolvedCustomerSchema,
  type ResolvedCustomer,
} from '../customers/customer-types.js'

export const customerSchema = resolvedCustomerSchema

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
  selectionMode: z.enum(['manual', 'random']),
  status: orderStatusSchema,
  unitPriceInCents: z.number().int().positive(),
  totalInCents: z.number().int().positive(),
  customer: resolvedCustomerSchema,
  items: z.array(ticketSchema).min(1),
  checkoutUrl: z.url().optional(),
  receiptUrl: z.url().optional(),
  transactionNsu: z.string().optional(),
  invoiceSlug: z.string().optional(),
  paidAmountInCents: z.number().int().positive().optional(),
  captureMethod: z.string().min(1).optional(),
  lastError: z.string().optional(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  paidAt: z.iso.datetime().optional(),
})

export const orderDraftSchema = orderSchema.omit({ items: true })

export const orderSelectionSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('manual'),
    cardIds: z.array(z.string().min(1)).min(1).max(50),
  }),
  z.object({
    mode: z.literal('random'),
    quantity: z.number().int().min(1).max(50),
  }),
])

export const createOrderInputSchema = z.object({
  raffleId: z.string().min(1),
  selection: orderSelectionSchema,
  customer: customerInputSchema,
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

export type Customer = ResolvedCustomer
export type Ticket = z.infer<typeof ticketSchema>
export type Order = z.infer<typeof orderSchema>
export type OrderDraft = z.infer<typeof orderDraftSchema>
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>
export type PaymentEvent = z.infer<typeof paymentEventSchema>
