import { createContext, useContext } from 'react'
import type { Raffle } from '../../raffle/domain/types'
import type { Cart } from '../domain/types'

export type CartContextValue = {
  cart: Cart | null
  itemCount: number
  totalInCents: number
  setSelection: (raffle: Raffle, cards: Raffle['cards']) => void
  removeCard: (cardId: string) => void
  clearCart: () => void
}

export const CartContext = createContext<CartContextValue | null>(null)

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart precisa estar dentro de CartProvider')
  return context
}
