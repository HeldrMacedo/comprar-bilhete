import type { Order } from '../orders/order-types.js'

export type PaymentReference = {
  orderId: string
  transactionNsu: string
  invoiceSlug: string
}

export type PaymentVerification = {
  paid: boolean
  amountInCents: number
  captureMethod: string
}

export interface PaymentGateway {
  createCheckout(order: Order): Promise<string>
  verifyPayment(reference: PaymentReference): Promise<PaymentVerification>
}
