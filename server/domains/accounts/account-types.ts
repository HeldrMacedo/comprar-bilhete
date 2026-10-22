import { z } from 'zod'
import { addressSchema, customerInputSchema, type Address } from '../customers/customer-types.js'

export const cpfSchema = z.string().regex(/^\d{11}$/, 'Informe um CPF com 11 dígitos.')
export const customerPasswordSchema = z
  .string()
  .min(8, 'A senha precisa ter ao menos 8 caracteres.')
  .max(128)
export const verificationCodeSchema = z.string().regex(/^\d{6}$/, 'Informe o código de 6 dígitos.')
export const codePurposeSchema = z.enum(['signup', 'first_access', 'reset', 'admin'])
const emailSchema = z.string().trim().toLowerCase().max(160).pipe(z.email())

// Cadastro completo: exigido no cadastro novo, na edição de perfil e para comprar.
export const profileSchema = z.object({
  name: z.string().trim().min(3).max(120),
  cpf: cpfSchema,
  phone: customerInputSchema.shape.phone,
  email: emailSchema,
  address: addressSchema,
})

export const loginInputSchema = z
  .object({ cpf: cpfSchema, password: z.string().min(1).max(128) })
  .strict()
export const identifyInputSchema = z.object({ cpf: cpfSchema }).strict()
export const requestCodeInputSchema = z
  .object({ purpose: z.enum(['first_access', 'reset']), cpf: cpfSchema })
  .strict()
export const registerInputSchema = z
  .object({ customer: profileSchema, password: customerPasswordSchema })
  .strict()
export const setPasswordInputSchema = z
  .object({
    cpf: cpfSchema,
    code: verificationCodeSchema,
    password: customerPasswordSchema,
    email: emailSchema.optional(),
  })
  .strict()
export const updateProfileInputSchema = z
  .object({
    customer: profileSchema.omit({ cpf: true }),
    currentPassword: z.string().min(1).max(128),
  })
  .strict()

export type CodePurpose = z.infer<typeof codePurposeSchema>
export type Profile = z.output<typeof profileSchema>
export type Account = {
  cpf: string
  externalId: string
  name: string
  email: string | null
  phone: string
  address?: Address
}
export type IdentifyResult =
  | { status: 'account' }
  | { status: 'first_access'; maskedEmail: string }
  | { status: 'no_email' }
  | { status: 'new' }
export type RequestCodeInput = z.output<typeof requestCodeInputSchema>
export type RegisterInput = z.output<typeof registerInputSchema>
export type SetPasswordInput = z.output<typeof setPasswordInputSchema>
export type UpdateProfileInput = z.output<typeof updateProfileInputSchema>

export function maskEmail(email: string) {
  const [user = '', domain = ''] = email.split('@')
  return `${user.slice(0, 2)}***@${domain}`
}

export function isProfileComplete(account: Account) {
  return profileSchema.safeParse(account).success
}
