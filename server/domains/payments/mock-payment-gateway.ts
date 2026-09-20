import type { ServerEnv } from '../../config/env.js'
import type { Order } from '../orders/order-types.js'
import type { PaymentGateway } from './payment-gateway.js'

export class MockPaymentGateway implements PaymentGateway {
  private readonly amounts = new Map<string, number>()

  constructor(private readonly env: ServerEnv) {}

  async createCheckout(order: Order) {
    this.amounts.set(order.id, order.totalInCents)
    const query = new URLSearchParams({
      order_nsu: order.id,
      transaction_nsu: `mock-${order.id}`,
      slug: `mock-${order.id}`,
      demo: 'true',
    })
    return `${this.env.PUBLIC_APP_URL}/pagamento?${query.toString()}`
  }

  async verifyPayment(reference: { orderId: string }) {
    return {
      paid: true,
      amountInCents: this.amounts.get(reference.orderId) ?? 0,
      captureMethod: 'pix',
    }
  }
}
