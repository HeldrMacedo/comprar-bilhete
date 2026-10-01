import { z } from 'zod'
import { orderSchema } from '../../checkout/api/schemas'

const purchaseItemSchema = orderSchema.shape.items.unwrap().element.extend({
  identification: z.string().min(1).optional(),
  drawDate: z.iso.datetime().optional(),
  prizes: z.array(z.string().min(1)).optional(),
  luckySpins: z.object({ count: z.number().int().positive(), label: z.string() }).optional(),
  validationBatch: z.string().optional(),
  batchPosition: z.number().int().nonnegative().optional(),
})

// O backend só envia `customer` em pedido pago, para o comprovante.
const purchaseCustomerSchema = z.object({
  name: z.string().min(1),
  city: z.string().min(1).optional(),
  phone: z.string().min(1),
  cpf: z.string().regex(/^\d{11}$/),
})

export const purchaseSchema = orderSchema.extend({
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime().optional(),
  paymentMethod: z.string().min(1).optional(),
  checkoutUrl: z.url().optional(),
  items: z.array(purchaseItemSchema).optional(),
  customer: purchaseCustomerSchema.optional(),
})

export const purchaseLookupSchema = z.object({ orders: z.array(purchaseSchema) })
