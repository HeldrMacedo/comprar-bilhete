import { z } from 'zod'
import { adminLoginSchema, adminPasswordSchema } from '../domains/admin/admin-types.js'

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

const proxyAddressSchema = z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()])

// Mesmo formato que o `trustProxy` do Fastify aceita: booleano, número de saltos ou lista de
// IPs/CIDRs confiáveis separados por vírgula. Vazio equivale a não confiar em proxy.
const trustProxySchema = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .optional()
    .transform((value, context): boolean | number | string[] => {
      if (value === undefined || value === 'false') return false
      if (value === 'true') return true
      if (/^\d+$/.test(value)) return Number(value)
      const addresses = value.split(',').map((item) => item.trim())
      if (addresses.every((item) => proxyAddressSchema.safeParse(item).success)) return addresses
      context.addIssue({
        code: 'custom',
        message: 'TRUST_PROXY aceita true, false, número de saltos ou lista de IPs/CIDRs',
      })
      return z.NEVER
    }),
)

// Origens aceitas em escritas além da de PUBLIC_APP_URL, separadas por vírgula. Serve a túneis
// de desenvolvimento que reescrevem o cabeçalho Origin (o devtunnel troca por http://localhost:5173).
const allowedOriginsSchema = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .optional()
    .transform((value, context): string[] => {
      if (value === undefined) return []
      const urls = value.split(',').map((item) => item.trim())
      if (urls.every((item) => z.url({ protocol: /^https?$/ }).safeParse(item).success)) {
        return urls.map((item) => new URL(item).origin)
      }
      context.addIssue({
        code: 'custom',
        message: 'ALLOWED_ORIGINS aceita URLs http(s) completas separadas por vírgula',
      })
      return z.NEVER
    }),
)

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
    TICKET_BANNER_BASE_URL: z.url().default('http://solidariedadesorte.ddns.net:8080'),
    TICKET_API_ALLOW_HTTP: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    TICKET_ESTABLISHMENT_ID: z.literal('4734').default('4734'),
    TICKET_REGIONAL_ID: z.literal('57').default('57'),
    TICKET_RESERVATION_PROVIDER: z.enum(['none', 'mock', 'live']).default('none'),
    TICKET_RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
    INFINITEPAY_API_BASE_URL: z.url().default('https://api.checkout.infinitepay.io'),
    INFINITEPAY_HANDLE: z.string().min(1).optional(),
    ADMIN_BOOTSTRAP_LOGIN: z.preprocess(emptyToUndefined, adminLoginSchema.optional()),
    ADMIN_BOOTSTRAP_PASSWORD: z.preprocess(emptyToUndefined, adminPasswordSchema.optional()),
    MAIL_PROVIDER: z.enum(['mock', 'smtp']).default('mock'),
    SMTP_HOST: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    SMTP_PASS: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    MAIL_FROM: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
    ACCOUNT_IDENTIFY_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
    ACCOUNT_CODE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(5),
    ZIP_CODE_PROVIDER: z.enum(['mock', 'brasilapi']).default('mock'),
    BRASIL_API_BASE_URL: z.url().default('https://brasilapi.com.br'),
    ZIP_CODE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),
    TRUST_PROXY: trustProxySchema,
    ALLOWED_ORIGINS: allowedOriginsSchema,
  })
  .superRefine((env, context) => {
    if (env.PAYMENT_PROVIDER === 'infinitepay' && !env.INFINITEPAY_HANDLE) {
      context.addIssue({
        code: 'custom',
        path: ['INFINITEPAY_HANDLE'],
        message: 'é obrigatório quando PAYMENT_PROVIDER=infinitepay',
      })
    }
    if (env.TICKET_RESERVATION_PROVIDER === 'live' && env.TICKET_PROVIDER !== 'live') {
      context.addIssue({
        code: 'custom',
        path: ['TICKET_RESERVATION_PROVIDER'],
        message: 'live exige TICKET_PROVIDER=live',
      })
    }
    if (Boolean(env.ADMIN_BOOTSTRAP_LOGIN) !== Boolean(env.ADMIN_BOOTSTRAP_PASSWORD)) {
      context.addIssue({
        code: 'custom',
        path: ['ADMIN_BOOTSTRAP_PASSWORD'],
        message: 'ADMIN_BOOTSTRAP_LOGIN e ADMIN_BOOTSTRAP_PASSWORD devem ser informados juntos',
      })
    }
    if (env.MAIL_PROVIDER === 'smtp') {
      for (const key of [
        'SMTP_HOST',
        'SMTP_PORT',
        'SMTP_USER',
        'SMTP_PASS',
        'MAIL_FROM',
      ] as const) {
        if (!env[key]) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} é obrigatório com MAIL_PROVIDER=smtp`,
          })
        }
      }
    }
    // Site público sem SMTP: nenhum cliente receberia código para entrar ou criar a senha.
    if (env.MAIL_PROVIDER === 'mock' && new URL(env.PUBLIC_APP_URL).protocol === 'https:') {
      context.addIssue({
        code: 'custom',
        path: ['MAIL_PROVIDER'],
        message: 'MAIL_PROVIDER=mock não é permitido com PUBLIC_APP_URL HTTPS; configure SMTP',
      })
    }
    if (
      env.TICKET_RESERVATION_PROVIDER !== 'none' &&
      env.TICKET_RESERVATION_TTL_MINUTES <= env.ORDER_EXPIRATION_MINUTES
    ) {
      context.addIssue({
        code: 'custom',
        path: ['TICKET_RESERVATION_TTL_MINUTES'],
        message: 'deve ser maior que ORDER_EXPIRATION_MINUTES',
      })
    }
  })

export type ServerEnv = z.infer<typeof serverEnvSchema>

export function parseServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse(source)
}
