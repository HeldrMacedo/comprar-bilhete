import type { Order, PaymentStatus } from '../../checkout/domain/types'

export type Purchase = Order & {
  createdAt: string
  paidAt?: string
  paymentMethod?: string
  checkoutUrl?: string
}

export type PurchaseStatus = PaymentStatus

export interface PurchaseRepository {
  lookupByCpf(cpf: string, signal?: AbortSignal): Promise<Purchase[]>
}
