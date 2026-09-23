export type Address = {
  zipCode: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
}

export type Customer = {
  name: string
  cpf: string
  phone: string
  address?: Address
}

export type LookupCriteria = { cpf?: string; phone?: string }

export type ExternalCustomer = Customer & { externalId: string }

export type CustomerLookupResult = { found: false } | { found: true; customer: ExternalCustomer }

export interface CustomerRepository {
  lookup(criteria: LookupCriteria, signal?: AbortSignal): Promise<CustomerLookupResult>
}

export type CreateOrderInput = {
  raffleId: string
  selection: { mode: 'manual'; cardIds: string[] } | { mode: 'random'; quantity: number }
  customer: Customer
}

export type PaymentStatus =
  'pending' | 'processing' | 'paid' | 'expired' | 'cancelled' | 'manual_review'

export type Order = {
  id: string
  status: PaymentStatus
  selectionMode?: 'manual' | 'random'
  unitPriceInCents?: number
  totalInCents: number
  items?: Array<{ id: string; code: string; numbers: number[] }>
  receiptUrl?: string
  expiresAt?: string
  message?: string
}

export type Checkout = { checkoutUrl: string }
