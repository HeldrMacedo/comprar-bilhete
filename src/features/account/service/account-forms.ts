import { z } from 'zod'
import { isValidCpf, onlyDigits } from '../../../shared/lib/forms'
import type { Profile } from '../domain/types'

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

const passwordField = z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.').max(128)
const emailField = z.string().trim().toLowerCase().pipe(z.email('Informe um email valido.'))
const phoneField = z
  .string()
  .refine((value) => [10, 11].includes(onlyDigits(value).length), 'Informe um celular com DDD.')

function confirmMatches<T extends { password: string; confirmPassword: string }>(
  value: T,
  context: z.RefinementCtx,
) {
  if (value.password !== value.confirmPassword) {
    context.addIssue({
      code: 'custom',
      path: ['confirmPassword'],
      message: 'As senhas não conferem.',
    })
  }
}

export const cpfFormSchema = z.object({
  cpf: z.string().refine(isValidCpf, 'Informe um CPF valido.'),
})
export const passwordFormSchema = z.object({ password: z.string().min(1, 'Informe sua senha.') })
export const codeField = z.string().regex(/^\d{6}$/, 'Informe o código de 6 dígitos.')

const profileFields = {
  name: z.string().trim().min(3, 'Informe seu nome completo.'),
  phone: phoneField,
  email: emailField,
  address: addressSchema,
}

export const signupFormSchema = z
  .object({
    ...profileFields,
    cpf: cpfFormSchema.shape.cpf,
    password: passwordField,
    confirmPassword: z.string(),
  })
  .superRefine(confirmMatches)

export const newPasswordFormSchema = z
  .object({ code: codeField, password: passwordField, confirmPassword: z.string() })
  .superRefine(confirmMatches)

// Cadastro na API sem e-mail: código do atendimento e o e-mail que passa a valer na conta.
export const noEmailFormSchema = z
  .object({
    code: codeField,
    email: emailField,
    password: passwordField,
    confirmPassword: z.string(),
  })
  .superRefine(confirmMatches)

export const profileFormSchema = z.object({
  ...profileFields,
  currentPassword: z.string().min(1, 'Informe sua senha atual para salvar.'),
})

export type SignupForm = z.input<typeof signupFormSchema>
export type SignupFormOutput = z.output<typeof signupFormSchema>
export type NewPasswordForm = z.input<typeof newPasswordFormSchema>
export type NoEmailForm = z.input<typeof noEmailFormSchema>
export type NoEmailFormOutput = z.output<typeof noEmailFormSchema>
export type AddressForm = z.input<typeof addressSchema>
export type ProfileForm = z.input<typeof profileFormSchema>
export type ProfileFormOutput = z.output<typeof profileFormSchema>

export function toProfile(form: SignupFormOutput): Profile {
  return {
    name: form.name,
    cpf: onlyDigits(form.cpf),
    phone: onlyDigits(form.phone),
    email: form.email,
    address: form.address,
  }
}
