import { z } from 'zod'
import { DomainError } from '../../shared/errors.js'
import type { ZipCodeAddress, ZipCodeGateway } from './zip-code-gateway.js'

const zipCodeResponseSchema = z.object({
  cep: z.string(),
  state: z.string(),
  city: z.string(),
  neighborhood: z.string().nullish(),
  street: z.string().nullish(),
})

function unavailable() {
  return new DomainError(
    'Consulta de CEP indisponível. Preencha o endereço.',
    502,
    'ZIP_CODE_UNAVAILABLE',
  )
}

// BrasilAPI CEP v2: responde 404 quando nenhum dos serviços encontra o CEP.
export class BrasilApiZipCodeGateway implements ZipCodeGateway {
  constructor(private readonly baseUrl: string) {}

  async lookup(zipCode: string): Promise<ZipCodeAddress | null> {
    let response: Response
    try {
      response = await fetch(
        `${this.baseUrl.replace(/\/$/, '')}/api/cep/v2/${encodeURIComponent(zipCode)}`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) },
      )
    } catch {
      throw unavailable()
    }

    if (response.status === 404) return null
    if (!response.ok) throw unavailable()

    const parsed = zipCodeResponseSchema.safeParse(await response.json().catch(() => null))
    if (!parsed.success) throw unavailable()
    return {
      zipCode,
      street: parsed.data.street?.trim() ?? '',
      neighborhood: parsed.data.neighborhood?.trim() ?? '',
      city: parsed.data.city.trim(),
      state: parsed.data.state.trim().toUpperCase(),
    }
  }
}
