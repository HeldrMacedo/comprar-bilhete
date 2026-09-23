import { z } from 'zod'

const serverEnvSchema = z
  .object({
    SERVER_PORT: z.coerce.number().int().positive().default(3333),
    DATABASE_PATH: z.string().default('./data/app.db'),
    PUBLIC_APP_URL: z.url().default('http://localhost:5173'),
    PUBLIC_API_URL: z.url().default('http://localhost:3333'),
    ORDER_EXPIRATION_MINUTES: z.coerce.number().int().positive().default(15),
    TICKET_PROVIDER: z.enum(['mock', 'live']).default('mock'),
    PAYMENT_PROVIDER: z.enum(['mock', 'infinitepay']).default('mock'),
    TICKET_API_BASE_URL: z.url().default('http://66.94.99.64:9090'),
    TICKET_ESTABLISHMENT_ID: z.literal('4734').default('4734'),
    TICKET_REGIONAL_ID: z.literal('57').default('57'),
    INFINITEPAY_API_BASE_URL: z.url().default('https://api.checkout.infinitepay.io'),
    INFINITEPAY_HANDLE: z.string().min(1).optional(),
  })
  .superRefine((env, context) => {
    if (env.PAYMENT_PROVIDER === 'infinitepay' && !env.INFINITEPAY_HANDLE) {
      context.addIssue({
        code: 'custom',
        path: ['INFINITEPAY_HANDLE'],
        message: 'é obrigatório quando PAYMENT_PROVIDER=infinitepay',
      })
    }
  })

export type ServerEnv = z.infer<typeof serverEnvSchema>

export function parseServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse(source)
}
