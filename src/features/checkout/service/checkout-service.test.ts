import { expect, it, vi } from 'vitest'
import type { Cart } from '../../cart/domain/types'
import { checkoutRepository } from '../repository/checkout-repository'
import { isProfileIncomplete, startCheckout } from './checkout-service'

vi.mock('../repository/checkout-repository', () => ({
  checkoutRepository: { createOrder: vi.fn(), createCheckout: vi.fn() },
}))

it('envia as seleções de cada sorteio para um único pedido, sem dados do cliente', async () => {
  const cart: Cart = {
    entries: [
      {
        raffleId: 'quarta',
        raffleTitle: 'Sorteio de Quarta',
        priceInCents: 1000,
        selection: {
          mode: 'manual',
          cards: [{ id: 'card-001', code: '#001', numbers: [1], available: true }],
        },
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

  await startCheckout(cart, { email: 'maria@example.com', beneficiaryName: 'João Terceiro' })

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
    email: 'maria@example.com',
    beneficiaryName: 'João Terceiro',
  })
  expect(checkoutRepository.createCheckout).toHaveBeenCalledTimes(1)
})

it('reconhece o pedido recusado por cadastro incompleto', async () => {
  const { ApiError } = await import('../../../shared/api/http-client')
  expect(isProfileIncomplete(new ApiError('Complete seus dados.', 400, 'PROFILE_INCOMPLETE'))).toBe(
    true,
  )
  expect(isProfileIncomplete(new ApiError('Reservado.', 409, 'TICKET_RESERVED'))).toBe(false)
})
