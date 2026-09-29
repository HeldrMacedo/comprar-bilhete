import { z } from 'zod'
import { orderSchema } from '../../checkout/api/schemas'

export const purchaseSchema = orderSchema.extend({
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime().optional(),
  paymentMethod: z.string().min(1).optional(),
  checkoutUrl: z.url().optional(),
})

export const purchaseLookupSchema = z.object({ orders: z.array(purchaseSchema) })
