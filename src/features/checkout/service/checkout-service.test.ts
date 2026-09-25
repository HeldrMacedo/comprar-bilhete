import { expect, it, vi } from 'vitest'
import type { Cart } from '../../cart/domain/types'
import { checkoutRepository } from '../repository/checkout-repository'
import { startCheckout } from './checkout-service'

vi.mock('../repository/checkout-repository', () => ({
  checkoutRepository: { createOrder: vi.fn(), createCheckout: vi.fn() },
}))

it('envia as seleções de cada sorteio para um único pedido', async () => {
  const cart: Cart = {
    entries: [
      {
        raffleId: 'quarta',
        raffleTitle: 'Sorteio de Quarta',
        priceInCents: 1000,
        selection: { mode: 'manual', cards: [{ id: 'card-001', code: '#001', numbers: [1], available: true }] },
      },
      {
        raffleId: 'domingo',
        raffleTitle: 'Sorteio de Domingo',
        priceInCents: 600,
        selection: { mode: 'random', quantity: 2 },
      },
    ],
  }
  vi.mocked(checkoutRepository.createOrder).mockResolvedValue({
    id: 'order-1',
    status: 'pending',
    totalInCents: 2200,
  })
  vi.mocked(checkoutRepository.createCheckout).mockResolvedValue({
    checkoutUrl: 'https://checkout.example',
  })

  await startCheckout(cart, { name: 'Maria da Silva', cpf: '529.982.247-25', phone: '(84) 99985-5367' })

  expect(checkoutRepository.createOrder).toHaveBeenCalledWith({
    raffles: [
      {
        raffleId: 'quarta',
        unitPriceInCents: 1000,
        selection: { mode: 'manual', cardIds: ['card-001'] },
      },
      {
        raffleId: 'domingo',
        unitPriceInCents: 600,
        selection: { mode: 'random', quantity: 2 },
      },
    ],
    customer: { name: 'Maria da Silva', cpf: '52998224725', phone: '+5584999855367' },
  })
  expect(checkoutRepository.createCheckout).toHaveBeenCalledTimes(1)
})
