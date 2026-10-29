import { z } from 'zod'
import { DomainError } from '../../shared/errors.js'
import { fetchJson } from '../../shared/fetch-json.js'
import { requireTicketApiTls } from '../../shared/ticket-api-tls.js'
import type { CustomerGateway } from './customer-gateway.js'
import {
  addressSchema,
  externalCustomerSchema,
  type CustomerRegistration,
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
    email: z.string().nullish(),
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

  async create(customer: NormalizedCustomerInput): Promise<void> {
    requireTicketApiTls(this.baseUrl, this.allowHttp)
    await fetchJson(`${this.baseUrl}/pessoa`, mutationResponseSchema, {
      method: 'POST',
      body: JSON.stringify({
        nome: customer.name,
        cpf: customer.cpf,
        fone: customer.phone,
        email: customer.email,
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

  // Grava ou edita a pessoa; a API exige senha nos dois casos e substitui o cadastro inteiro.
  async register(input: CustomerRegistration): Promise<void> {
    requireTicketApiTls(this.baseUrl, this.allowHttp)
    await fetchJson(`${this.baseUrl}/pessoa/cadastro`, mutationResponseSchema, {
      method: 'POST',
      body: JSON.stringify({
        nome: input.name,
        cpf: input.cpf,
        senha: input.password,
        confirma_senha: input.password,
        email: input.email ?? '',
        fone: input.phone,
        cep: input.address?.zipCode,
        endereco: input.address?.street,
        numero: input.address?.number,
        complemento: input.address?.complement,
        bairro: input.address?.neighborhood,
        cidade: input.address?.city,
        uf: input.address?.state,
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
      zipCode: onlyDigits(person.cep ?? '') || undefined,
      street: person.endereco ?? '',
      number: person.numero ?? '',
      complement: person.complemento?.trim() || undefined,
      neighborhood: person.bairro ?? '',
      city: person.cidade ?? '',
      state: person.uf ?? '',
    })
    // A API devolve `email: ""` quando a pessoa não informou; email inválido é ignorado.
    const email = z.email().safeParse(person.email?.trim().toLowerCase())

    return externalCustomerSchema.parse({
      externalId: person.pessoas_id,
      name: person.nome.trim(),
      cpf: onlyDigits(person.cpf),
      phone: onlyDigits(person.fone),
      email: email.success ? email.data : undefined,
      address: address.success ? address.data : undefined,
    })
  }
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}
