import { z } from 'zod'
import { DomainError } from '../../shared/errors.js'
import { fetchJson } from '../../shared/fetch-json.js'
import { requireTicketApiTls } from '../../shared/ticket-api-tls.js'
import type { CustomerGateway } from './customer-gateway.js'
import {
  addressSchema,
  externalCustomerSchema,
  type ExternalCustomer,
  type NormalizedCustomerInput,
} from './customer-types.js'

const personResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    pessoas_id: z.union([z.string(), z.number().int()]).transform(String),
    nome: z.string(),
    cpf: z.string(),
    fone: z.string(),
    cep: z.string().nullish(),
    endereco: z.string().nullish(),
    numero: z.string().nullish(),
    complemento: z.string().nullish(),
    bairro: z.string().nullish(),
    cidade: z.string().nullish(),
    uf: z.string().nullish(),
  }),
})

const mutationResponseSchema = z.object({ success: z.literal(true) }).passthrough()

export class LiveCustomerGateway implements CustomerGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly allowHttp = false,
  ) {}

  findByCpf(cpf: string) {
    return this.find(`/pessoa/cpf/${encodeURIComponent(cpf)}`)
  }

  findByPhone(phone: string) {
    return this.find(`/pessoa/fone/${encodeURIComponent(phone)}`)
  }

  async create(customer: NormalizedCustomerInput): Promise<void> {
    requireTicketApiTls(this.baseUrl, this.allowHttp)
    await fetchJson(`${this.baseUrl}/pessoa`, mutationResponseSchema, {
      method: 'POST',
      body: JSON.stringify({
        nome: customer.name,
        cpf: customer.cpf,
        fone: customer.phone,
        cep: customer.address?.zipCode,
        endereco: customer.address?.street,
        numero: customer.address?.number,
        complemento: customer.address?.complement,
        bairro: customer.address?.neighborhood,
        cidade: customer.address?.city,
        uf: customer.address?.state,
      }),
    })
  }

  private async find(path: string): Promise<ExternalCustomer | null> {
    requireTicketApiTls(this.baseUrl, this.allowHttp)
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new DomainError('Serviço externo indisponível.', 502, 'UPSTREAM_ERROR')
    }

    if (response.status === 404) return null
    if (!response.ok) {
      throw new DomainError('Serviço externo indisponível.', 502, 'UPSTREAM_ERROR')
    }

    const body: unknown = await response.json().catch(() => null)
    const parsed = personResponseSchema.safeParse(body)
    if (!parsed.success) {
      throw new DomainError(
        'Serviço externo respondeu fora do contrato esperado.',
        502,
        'UPSTREAM_SCHEMA',
      )
    }

    const person = parsed.data.data
    const address = addressSchema.safeParse({
      zipCode: onlyDigits(person.cep ?? ''),
      street: person.endereco ?? '',
      number: person.numero ?? '',
      complement: person.complemento?.trim() || undefined,
      neighborhood: person.bairro ?? '',
      city: person.cidade ?? '',
      state: person.uf ?? '',
    })

    return externalCustomerSchema.parse({
      externalId: person.pessoas_id,
      name: person.nome.trim(),
      cpf: onlyDigits(person.cpf),
      phone: onlyDigits(person.fone),
      address: address.success ? address.data : undefined,
    })
  }
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}
