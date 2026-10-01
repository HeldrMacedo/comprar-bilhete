import type { Order, PaymentStatus } from '../../checkout/domain/types'

export type PurchaseItem = NonNullable<Order['items']>[number] & {
  identification?: string
  drawDate?: string
  prizes?: string[]
  luckySpins?: { count: number; label: string }
  validationBatch?: string
  batchPosition?: number
}

export type PurchaseCustomer = {
  name: string
  city?: string
  phone: string
  cpf: string
}

export type Purchase = Omit<Order, 'items'> & {
  items?: PurchaseItem[]
  customer?: PurchaseCustomer
  createdAt: string
  paidAt?: string
  paymentMethod?: string
  checkoutUrl?: string
}

export type PurchaseStatus = PaymentStatus

export interface PurchaseRepository {
  lookupByCpf(cpf: string, signal?: AbortSignal): Promise<Purchase[]>
}
