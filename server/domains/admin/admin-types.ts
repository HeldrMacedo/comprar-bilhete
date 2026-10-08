import { z } from 'zod'

export const adminLoginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, 'Use de 3 a 40 letras minúsculas, números, ponto, hífen ou _.')
export const adminPasswordSchema = z
  .string()
  .min(12, 'A senha precisa de pelo menos 12 caracteres.')
  .max(128, 'A senha pode ter no máximo 128 caracteres.')
export const adminNameSchema = z.string().trim().min(1, 'Informe o nome.').max(80)

export const loginInputSchema = z
  .object({
    login: z.string().trim().toLowerCase().min(1).max(40),
    password: z.string().min(1).max(128),
  })
  .strict()

export const createAdminUserInputSchema = z
  .object({ login: adminLoginSchema, name: adminNameSchema, password: adminPasswordSchema })
  .strict()

export const updateAdminUserInputSchema = z
  .object({
    login: adminLoginSchema.optional(),
    name: adminNameSchema.optional(),
    password: adminPasswordSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict()

export type CreateAdminUserInput = z.infer<typeof createAdminUserInputSchema>
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserInputSchema>

export const adminUserRowSchema = z.object({
  id: z.string(),
  login: z.string(),
  name: z.string(),
  password_hash: z.string(),
  active: z.number().transform((value) => value === 1),
  created_at: z.string(),
  updated_at: z.string(),
})

export type AdminUserRecord = z.infer<typeof adminUserRowSchema>

export type AdminUser = {
  id: string
  login: string
  name: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export function toAdminUser(record: AdminUserRecord): AdminUser {
  return {
    id: record.id,
    login: record.login,
    name: record.name,
    active: record.active,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  }
}
