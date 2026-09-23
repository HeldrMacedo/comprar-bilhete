import { z } from 'zod'
import type { ServerEnv } from '../../config/env.js'
import { DomainError } from '../../shared/errors.js'
import { fetchJson } from '../../shared/fetch-json.js'
import type { Order } from '../orders/order-types.js'
import type { PaymentGateway, PaymentReference } from './payment-gateway.js'

const checkoutResponseSchema = z.object({ url: z.url() })
const paymentCheckSchema = z.object({
  success: z.literal(true),
  paid: z.boolean(),
  amount: z.number().int().nonnegative(),
  paid_amount: z.number().int().nonnegative(),
  installments: z.number().int().positive(),
  capture_method: z.string(),
})

export class InfinitePayGateway implements PaymentGateway {
  constructor(private readonly env: ServerEnv) {}

  async createCheckout(order: Order) {
    if (order.totalInCents !== order.unitPriceInCents * order.items.length) {
      throw new DomainError('Total do pedido inconsistente.', 500, 'INVALID_ORDER_TOTAL')
    }

    const address = order.customer.address
    const response = await fetchJson(
      `${this.env.INFINITEPAY_API_BASE_URL}/links`,
      checkoutResponseSchema,
      {
        method: 'POST',
        body: JSON.stringify({
          handle: this.env.INFINITEPAY_HANDLE,
          redirect_url: `${this.env.PUBLIC_APP_URL}/pagamento`,
          webhook_url: `${this.env.PUBLIC_API_URL}/api/v1/webhooks/infinitepay`,
          order_nsu: order.id,
        customer: {
          name: order.customer.name,
          phone_number: `+55${order.customer.phone}`,
        },
        address: address
          ? {
              cep: address.zipCode,
              street: address.street,
              neighborhood: address.neighborhood,
              number: address.number,
              complement: address.complement,
            }
          : undefined,
        items: order.items.map((item) => ({
          quantity: 1,
          price: order.unitPriceInCents,
            description: `Cartela ${item.code} — ${order.raffleTitle}`,
          })),
        }),
      },
    )
    return response.url
  }

  async verifyPayment(reference: PaymentReference) {
    const response = await fetchJson(
      `${this.env.INFINITEPAY_API_BASE_URL}/payment_check`,
      paymentCheckSchema,
      {
        method: 'POST',
        body: JSON.stringify({
          handle: this.env.INFINITEPAY_HANDLE,
          order_nsu: reference.orderId,
          transaction_nsu: reference.transactionNsu,
          slug: reference.invoiceSlug,
        }),
      },
    )
    return {
      paid: response.paid,
      amountInCents: response.amount,
      captureMethod: response.capture_method,
    }
  }
}
