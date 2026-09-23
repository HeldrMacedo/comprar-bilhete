import { env } from '../../../shared/config/env'
import { onlyDigits } from '../../../shared/lib/forms'
import type { Cart } from '../../cart/domain/types'
import type { Customer } from '../domain/types'
import { checkoutRepository } from '../repository/checkout-repository'

export async function startCheckout(cart: Cart, customer: Customer) {
  const order = await checkoutRepository.createOrder({
    raffleId: cart.raffleId,
    selection:
      cart.selection.mode === 'manual'
        ? { mode: 'manual', cardIds: cart.selection.cards.map((card) => card.id) }
        : { mode: 'random', quantity: cart.selection.quantity },
    customer: {
      ...customer,
      cpf: onlyDigits(customer.cpf),
      phone: `+55${onlyDigits(customer.phone)}`,
    },
  })

  const checkout = await checkoutRepository.createCheckout(order.id, env.VITE_PAYMENT_RETURN_URL)
  return { order, checkout }
}
