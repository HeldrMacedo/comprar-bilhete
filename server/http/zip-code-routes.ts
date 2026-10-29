import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { ServerEnv } from '../config/env.js'
import type { ZipCodeGateway } from '../domains/addresses/zip-code-gateway.js'
import { DomainError } from '../shared/errors.js'
import { createRateLimiter } from './rate-limit.js'

const zipCodeParamsSchema = z.object({
  zipCode: z.string().regex(/^\d{8}$/, 'Informe um CEP com 8 dígitos.'),
})

export async function registerZipCodeRoutes(
  app: FastifyInstance,
  env: ServerEnv,
  zipCodes: ZipCodeGateway,
) {
  // Limite por IP: a rota é pública e repassa cada consulta à BrasilAPI.
  const limitLookups = createRateLimiter(env.ZIP_CODE_LIMIT_PER_MINUTE, 60_000)

  app.get('/api/v1/zip-codes/:zipCode', async (request, reply) => {
    limitLookups(request.ip)
    const { zipCode } = zipCodeParamsSchema.parse(request.params)
    const address = await zipCodes.lookup(zipCode)
    if (!address) {
      throw new DomainError('CEP não encontrado. Preencha o endereço.', 404, 'ZIP_CODE_NOT_FOUND')
    }
    reply.header('Cache-Control', 'public, max-age=86400')
    return { address }
  })
}
