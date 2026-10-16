import { z } from 'zod'
import { isValidCpf, onlyDigits } from '../../../shared/lib/forms'
import { addressSchema } from '../../account/service/account-forms'
import type { Customer } from '../domain/types'

const customerBaseSchema = z.object({
  name: z.string().trim().min(3, 'Informe seu nome completo.'),
  cpf: z.string().refine(isValidCpf, 'Informe um CPF valido.'),
  phone: z
    .string()
    .refine((value) => [10, 11].includes(onlyDigits(value).length), 'Informe um celular com DDD.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => !value || z.email().safeParse(value).success, 'Informe um email valido.')
    .optional()
    .transform((value) => value || undefined),
  address: addressSchema,
  buyingForThirdParty: z.boolean().optional(),
  beneficiaryName: z.string().optional(),
})

export const customerSchema = customerBaseSchema.superRefine((value, context) => {
  if (value.buyingForThirdParty && (value.beneficiaryName ?? '').trim().length < 3) {
    context.addIssue({
      code: 'custom',
      path: ['beneficiaryName'],
      message: 'Informe o nome completo de quem vai concorrer.',
    })
  }
})

export type CustomerForm = z.input<typeof customerSchema>
export type CustomerFormOutput = z.output<typeof customerSchema>

// O cadastro (nome, CPF, telefone, endereço) é sempre do comprador; o nome do terceiro vai só no bilhete.
export function toCheckoutCustomer(form: CustomerFormOutput): Customer {
  const { buyingForThirdParty, beneficiaryName, ...customer } = form
  const holder = beneficiaryName?.trim()
  return buyingForThirdParty && holder ? { ...customer, beneficiaryName: holder } : customer
}
