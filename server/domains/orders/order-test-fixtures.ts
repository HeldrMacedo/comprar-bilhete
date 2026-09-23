import { resolvedCustomerSchema } from '../customers/customer-types.js'
import {
  orderDraftSchema,
  orderSchema,
  ticketSchema,
  type Order,
  type OrderDraft,
  type Ticket,
} from './order-types.js'

export const existingMaria = resolvedCustomerSchema.parse({
  externalId: '2015',
  registrationStatus: 'existing',
  name: 'Maria da Silva',
  cpf: '52998224725',
  phone: '84999855367',
})

const orderIds: Record<string, string> = {
  first: '00000000-0000-4000-8000-000000000001',
  second: '00000000-0000-4000-8000-000000000002',
  third: '00000000-0000-4000-8000-000000000003',
}

export function ticket(id: string): Ticket {
  return ticketSchema.parse({
    id,
    code: id,
    numbers: [1, 2, 3, 4, 5],
    validationBatch: 'mock',
    batchPosition: Number(id.replace(/\D/g, '')) || 1,
  })
}

export function orderDraft(key: string, overrides: Partial<OrderDraft> = {}): OrderDraft {
  return orderDraftSchema.parse({
    id: orderIds[key] ?? key,
    raffleId: 'sorteio-setembro',
    raffleTitle: 'Sorteio de Setembro',
    selectionMode: 'random',
    status: 'pending',
    unitPriceInCents: 1000,
    totalInCents: 2000,
    customer: existingMaria,
    createdAt: '2026-09-23T10:00:00.000Z',
    expiresAt: '2026-09-23T10:15:00.000Z',
    ...overrides,
  })
}

export function order(overrides: Partial<Order> = {}): Order {
  const items = overrides.items ?? [ticket('card-001')]
  return orderSchema.parse({
    ...orderDraft('first', {
      selectionMode: 'manual',
      totalInCents: 1000 * items.length,
    }),
    items,
    ...overrides,
  })
}
