import { requestJson } from '../../../shared/api/http-client'
import { apiRoutes } from '../../../shared/config/api-routes'
import { env } from '../../../shared/config/env'
import { purchaseLookupSchema } from '../api/schemas'
import type { Purchase, PurchaseRepository } from '../domain/types'

const mockCpf = '52998224725'
const mockPurchase: Purchase = {
  id: '5f3a9c21-7d4e-4b8a-9c1f-2e6d8b0a4f17',
  status: 'paid',
  selectionMode: 'manual',
  unitPriceInCents: 1000,
  totalInCents: 1000,
  paymentMethod: 'pix',
  createdAt: '2026-09-27T13:05:00.000Z',
  paidAt: '2026-09-27T13:07:00.000Z',
  items: [
    {
      id: 'card-001',
      code: '#001',
      numbers: [1, 2, 14, 15, 27, 28, 40, 53, 66, 79],
      secondChanceNumbers: [1, 3, 18, 20, 35, 37, 52, 69, 76, 86],
      raffleId: 'sorteio-setembro',
      raffleTitle: 'Sorteio Especial de Setembro',
      unitPriceInCents: 1000,
      identification: '60410080001-00',
      drawDate: '2026-09-30T21:00:00.000Z',
      prizes: ['1 AVELLOZ AZ1', '1 AVELLOZ AZ1', '1 AVELLOZ AZ1', '1 HONDA START 160 + 20 MIL'],
      luckySpins: { count: 10, label: 'R$ 300,00' },
      validationBatch: '84734',
      batchPosition: 1,
    },
  ],
  customer: { name: 'Maria da Silva', phone: '84999855367', cpf: '52998224725' },
}

const liveRepository: PurchaseRepository = {
  async lookupByCpf(cpf, signal) {
    const response = await requestJson(apiRoutes.purchaseLookup, purchaseLookupSchema, {
      method: 'POST',
      body: { cpf },
      signal,
    })
    return response.orders
  },
}

const mockRepository: PurchaseRepository = {
  async lookupByCpf(cpf) {
    await new Promise((resolve) => window.setTimeout(resolve, 250))
    return cpf === mockCpf ? [structuredClone(mockPurchase)] : []
  },
}

export const purchaseRepository = env.VITE_API_MODE === 'live' ? liveRepository : mockRepository
