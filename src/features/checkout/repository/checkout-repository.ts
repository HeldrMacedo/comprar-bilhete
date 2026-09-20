import { requestJson } from '../../../shared/api/http-client'
import { apiRoutes } from '../../../shared/config/api-routes'
import { env } from '../../../shared/config/env'
import { checkoutSchema, orderSchema } from '../api/schemas'
import type { Checkout, CreateOrderInput, Order } from '../domain/types'

export interface CheckoutRepository {
  createOrder(input: CreateOrderInput): Promise<Order>
  createCheckout(orderId: string, returnUrl: string): Promise<Checkout>
  getOrder(orderId: string): Promise<Order>
}

const mockOrders = new Map<string, { order: Order; checks: number }>()

const mockRepository: CheckoutRepository = {
  async createOrder(input) {
    await delay(350)
    const id = `demo-${Date.now()}`
    const order: Order = {
      id,
      status: 'pending',
      totalInCents: input.cardIds.length * 1000,
    }
    mockOrders.set(id, { order, checks: 0 })
    sessionStorage.setItem(`mock-order:${id}`, JSON.stringify({ order, checks: 0 }))
    return order
  },
  async createCheckout(orderId, returnUrl) {
    await delay(250)
    return { checkoutUrl: `${returnUrl}?order_nsu=${encodeURIComponent(orderId)}&demo=true` }
  },
  async getOrder(orderId) {
    await delay(300)
    const stored = mockOrders.get(orderId) ?? readMockOrder(orderId)
    if (!stored) throw new Error('Pedido de demonstração não encontrado.')
    stored.checks += 1
    if (stored.checks >= 3) stored.order.status = 'paid'
    mockOrders.set(orderId, stored)
    sessionStorage.setItem(`mock-order:${orderId}`, JSON.stringify(stored))
    return { ...stored.order }
  },
}

const liveRepository: CheckoutRepository = {
  createOrder: (input) =>
    requestJson(apiRoutes.createOrder, orderSchema, { method: 'POST', body: input }),
  createCheckout: (orderId, returnUrl) =>
    requestJson(apiRoutes.createCheckout(orderId), checkoutSchema, {
      method: 'POST',
      body: { returnUrl },
    }),
  getOrder: (orderId) => requestJson(apiRoutes.order(orderId, readPaymentReference()), orderSchema),
}

export const checkoutRepository = env.VITE_API_MODE === 'live' ? liveRepository : mockRepository

function readMockOrder(orderId: string) {
  try {
    return JSON.parse(sessionStorage.getItem(`mock-order:${orderId}`) ?? 'null') as {
      order: Order
      checks: number
    } | null
  } catch {
    return null
  }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function readPaymentReference() {
  const query = new URLSearchParams(window.location.search)
  const transactionNsu = query.get('transaction_nsu')
  const slug = query.get('slug')
  return transactionNsu && slug ? { transactionNsu, slug } : undefined
}
