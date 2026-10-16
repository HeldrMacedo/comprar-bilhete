import { z } from 'zod'
import type { OrderOptions } from '../domain/types'

export const orderOptionsSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email('Informe um email valido.')),
    buyingForThirdParty: z.boolean().optional(),
    beneficiaryName: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.buyingForThirdParty && (value.beneficiaryName ?? '').trim().length < 3) {
      context.addIssue({
        code: 'custom',
        path: ['beneficiaryName'],
        message: 'Informe o nome completo de quem vai concorrer.',
      })
    }
  })

export type OrderOptionsForm = z.input<typeof orderOptionsSchema>
export type OrderOptionsFormOutput = z.output<typeof orderOptionsSchema>

// O cadastro é sempre do comprador logado; o nome do terceiro vai só no bilhete.
export function toOrderOptions(form: OrderOptionsFormOutput): OrderOptions {
  const holder = form.beneficiaryName?.trim()
  return form.buyingForThirdParty && holder
    ? { email: form.email, beneficiaryName: holder }
    : { email: form.email }
}
