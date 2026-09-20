export type Customer = {
  name: string
  cpf: string
  phone: string
}

export type CreateOrderInput = {
  raffleId: string
  cardIds: string[]
  customer: Customer
}

export type PaymentStatus =
  'pending' | 'processing' | 'paid' | 'expired' | 'cancelled' | 'manual_review'

export type Order = {
  id: string
  status: PaymentStatus
  totalInCents: number
  receiptUrl?: string
}

export type Checkout = {
  checkoutUrl: string
}
