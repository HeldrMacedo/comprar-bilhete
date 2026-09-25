import { createContext, useContext } from 'react'
import type { Raffle } from '../../raffle/domain/types'
import type { Cart, CartSelection } from '../domain/types'

export type CartContextValue = {
  cart: Cart | null
  itemCount: number
  totalInCents: number
  setSelections: (entries: Array<{ raffle: Raffle; selection: CartSelection }>) => void
  removeCard: (raffleId: string, cardId: string) => void
  clearCart: () => void
}

export const CartContext = createContext<CartContextValue | null>(null)

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart precisa estar dentro de CartProvider')
  return context
}
