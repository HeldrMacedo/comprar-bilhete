import { env } from '../../../shared/config/env'
import { ApiError } from '../../../shared/api/http-client'
import type { Cart } from '../../cart/domain/types'
import type { OrderOptions } from '../domain/types'
import { checkoutRepository } from '../repository/checkout-repository'

// O comprador vem da sessão no backend; o corpo leva só as seleções e as opções do pedido.
export async function startCheckout(cart: Cart, options: OrderOptions) {
  const order = await checkoutRepository.createOrder({
    raffles: cart.entries.map((entry) => ({
      raffleId: entry.raffleId,
      unitPriceInCents: entry.priceInCents,
      selection:
        entry.selection.mode === 'manual'
          ? { mode: 'manual', cardIds: entry.selection.cards.map((card) => card.id) }
          : { mode: 'random', quantity: entry.selection.quantity },
    })),
    ...options,
  })

  const checkout = await checkoutRepository.createCheckout(order.id, env.VITE_PAYMENT_RETURN_URL)
  return { order, checkout }
}

export function isReservationConflict(error: unknown) {
  return (
    error instanceof ApiError &&
    ['TICKET_RESERVED', 'INSUFFICIENT_TICKETS'].includes(error.code ?? '')
  )
}

// Cadastro sem endereço ou celular no servidor: o pedido só sai depois de completar os dados.
export function isProfileIncomplete(error: unknown) {
  return error instanceof ApiError && error.code === 'PROFILE_INCOMPLETE'
}
