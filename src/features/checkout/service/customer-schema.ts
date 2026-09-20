import { z } from 'zod'
import { isValidCpf, onlyDigits } from '../../../shared/lib/forms'

export const customerSchema = z.object({
  name: z.string().trim().min(3, 'Informe seu nome completo.'),
  cpf: z.string().refine(isValidCpf, 'Informe um CPF válido.'),
  phone: z
    .string()
    .refine((value) => onlyDigits(value).length === 11, 'Informe um celular com DDD.'),
})

export type CustomerForm = z.infer<typeof customerSchema>
