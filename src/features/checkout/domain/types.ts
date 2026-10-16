export type CreateOrderInput = {
  raffles: Array<{
    raffleId: string
    unitPriceInCents: number
    selection: { mode: 'manual'; cardIds: string[] } | { mode: 'random'; quantity: number }
  }>
  beneficiaryName?: string
  email?: string
}

export type OrderOptions = { beneficiaryName?: string; email?: string }

export type PaymentStatus =
  'pending' | 'processing' | 'paid' | 'expired' | 'cancelled' | 'manual_review'

export type Order = {
  id: string
  status: PaymentStatus
  selectionMode?: 'manual' | 'random'
  unitPriceInCents?: number
  totalInCents: number
  items?: Array<{
    id: string
    code: string
    numbers: number[]
    secondChanceNumbers?: number[]
    raffleId: string
    raffleTitle: string
    unitPriceInCents: number
  }>
  receiptUrl?: string
  expiresAt?: string
  message?: string
}

export type Checkout = { checkoutUrl: string }
