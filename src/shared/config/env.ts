import { z } from 'zod'

const envSchema = z.object({
  VITE_API_MODE: z.enum(['mock', 'live']).default('mock'),
  VITE_API_BASE_URL: z.string().default('/api'),
  VITE_PAYMENT_RETURN_URL: z.string().default(`${window.location.origin}/pagamento`),
})

export const env = envSchema.parse(import.meta.env)
