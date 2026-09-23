import { z } from 'zod'
import { isValidCpf, onlyDigits } from '../../../shared/lib/forms'

export const addressSchema = z.object({
  zipCode: z
    .string()
    .transform(onlyDigits)
    .pipe(z.string().length(8, 'Informe um CEP valido.')),
  street: z.string().trim().min(1, 'Informe o endereco.'),
  number: z.string().trim().min(1, 'Informe o numero.'),
  complement: z.string().trim().optional(),
  neighborhood: z.string().trim().min(1, 'Informe o bairro.'),
  city: z.string().trim().min(1, 'Informe a cidade.'),
  state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Informe a UF.'),
})

const customerBaseSchema = z.object({
  name: z.string().trim().min(3, 'Informe seu nome completo.'),
  cpf: z.string().refine(isValidCpf, 'Informe um CPF valido.'),
  phone: z
    .string()
    .refine(
      (value) => [10, 11].includes(onlyDigits(value).length),
      'Informe um celular com DDD.',
    ),
  address: addressSchema.optional(),
})

export function createCustomerSchema(addressRequired: boolean) {
  return customerBaseSchema.superRefine((value, context) => {
    if (!addressRequired) return
    const result = addressSchema.safeParse(value.address)
    if (result.success) return
    for (const issue of result.error.issues) {
      context.addIssue({ ...issue, path: ['address', ...issue.path] })
    }
  })
}

export const customerSchema = createCustomerSchema(false)
export type CustomerForm = z.input<typeof customerSchema>
