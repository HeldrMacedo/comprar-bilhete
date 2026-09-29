import { z } from 'zod'
import { isValidCpf, onlyDigits } from '../../../shared/lib/forms'
import type { Customer } from '../domain/types'

export const addressSchema = z.object({
  zipCode: z.string().transform(onlyDigits).pipe(z.string().length(8, 'Informe um CEP valido.')),
  street: z.string().trim().min(1, 'Informe o endereco.'),
  number: z.string().trim().min(1, 'Informe o numero.'),
  complement: z.string().trim().optional(),
  neighborhood: z.string().trim().min(1, 'Informe o bairro.'),
  city: z.string().trim().min(1, 'Informe a cidade.'),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Informe a UF.'),
})

const customerBaseSchema = z.object({
  name: z.string().trim().min(3, 'Informe seu nome completo.'),
  cpf: z.string().refine(isValidCpf, 'Informe um CPF valido.'),
  phone: z
    .string()
    .refine((value) => [10, 11].includes(onlyDigits(value).length), 'Informe um celular com DDD.'),
  address: addressSchema.optional(),
  buyingForThirdParty: z.boolean().optional(),
  beneficiaryName: z.string().optional(),
})

export function createCustomerSchema(addressRequired: boolean) {
  return customerBaseSchema.superRefine((value, context) => {
    if (value.buyingForThirdParty && (value.beneficiaryName ?? '').trim().length < 3) {
      context.addIssue({
        code: 'custom',
        path: ['beneficiaryName'],
        message: 'Informe o nome completo de quem vai concorrer.',
      })
    }
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

// O cadastro (nome, CPF, telefone, endereço) é sempre do comprador; o nome do terceiro vai só no bilhete.
export function toCheckoutCustomer(form: CustomerForm): Customer {
  const { buyingForThirdParty, beneficiaryName, ...customer } = form
  const holder = beneficiaryName?.trim()
  return buyingForThirdParty && holder ? { ...customer, beneficiaryName: holder } : customer
}
