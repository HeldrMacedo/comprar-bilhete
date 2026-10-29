import { z } from 'zod'

export const addressSchema = z.object({
  zipCode: z.string().optional(),
  street: z.string(),
  number: z.string(),
  complement: z.string().optional(),
  neighborhood: z.string(),
  city: z.string(),
  state: z.string(),
})

export const accountSchema = z.object({
  cpf: z.string().regex(/^\d{11}$/),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string(),
  address: addressSchema.optional(),
  complete: z.boolean(),
})

export const accountResponseSchema = z.object({ account: accountSchema })

export const identifyResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('account') }),
  z.object({ status: z.literal('first_access'), maskedEmail: z.string() }),
  z.object({ status: z.literal('no_email') }),
  z.object({ status: z.literal('new') }),
])

export const zipCodeResponseSchema = z.object({
  address: z.object({
    zipCode: z.string(),
    street: z.string(),
    neighborhood: z.string(),
    city: z.string(),
    state: z.string(),
  }),
})

export const noContentSchema = z.undefined()
