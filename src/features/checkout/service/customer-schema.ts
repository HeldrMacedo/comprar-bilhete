import { z } from 'zod'
import { isValidCpf, onlyDigits } from '../../../shared/lib/forms'
import type { Customer } from '../domain/types'

const upperText = (message: string) => z.string().trim().toUpperCase().min(1, message)

export const addressSchema = z.object({
  zipCode: z.string().transform(onlyDigits).pipe(z.string().length(8, 'Informe um CEP valido.')),
  street: upperText('Informe o endereco.'),
  number: upperText('Informe o numero.'),
  complement: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((value) => value || undefined),
  neighborhood: upperText('Informe o bairro.'),
  city: upperText('Informe a cidade.'),
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
