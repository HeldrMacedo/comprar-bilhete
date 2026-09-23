import { z } from 'zod'

export const addressSchema = z.object({
  zipCode: z.string().regex(/^\d{8}$/),
  street: z.string().trim().min(1).max(160),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(80).optional(),
  neighborhood: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
})

export const customerInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  cpf: z.string().regex(/^\d{11}$/),
  phone: z
    .string()
    .regex(/^(?:\+55)?\d{10,11}$/)
    .transform((phone) => phone.replace(/^\+55/, '')),
  address: addressSchema.optional(),
})

export const externalCustomerSchema = z.object({
  externalId: z.string().min(1),
  name: z.string(),
  cpf: z.string(),
  phone: z.string(),
  address: addressSchema.optional(),
})

export const resolvedCustomerSchema = customerInputSchema.extend({
  externalId: z.string().min(1).optional(),
  registrationStatus: z.enum(['existing', 'new']).default('existing'),
})

export type Address = z.infer<typeof addressSchema>
export type CustomerInput = z.input<typeof customerInputSchema>
export type NormalizedCustomerInput = z.output<typeof customerInputSchema>
export type ExternalCustomer = z.infer<typeof externalCustomerSchema>
export type ResolvedCustomer = z.infer<typeof resolvedCustomerSchema>
export type CustomerLookupCriteria = { cpf?: string; phone?: string }
export type CustomerLookupResult =
  | { found: false }
  | { found: true; customer: ExternalCustomer }
