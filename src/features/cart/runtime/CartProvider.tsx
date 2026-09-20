import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { raffleCardSchema } from '../../raffle/api/schemas'
import type { Cart } from '../domain/types'
import { CartContext, type CartContextValue } from './cart-context'

const storageKey = 'bilhete-da-sorte:cart:v1'
const cartSchema = z.object({
  raffleId: z.string(),
  raffleTitle: z.string(),
  priceInCents: z.number().int().positive(),
  cards: z.array(raffleCardSchema),
})

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(readStoredCart)

  useEffect(() => {
    if (cart) localStorage.setItem(storageKey, JSON.stringify(cart))
    else localStorage.removeItem(storageKey)
  }, [cart])

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      itemCount: cart?.cards.length ?? 0,
      totalInCents: (cart?.cards.length ?? 0) * (cart?.priceInCents ?? 0),
      setSelection: (raffle, cards) =>
        setCart({
          raffleId: raffle.id,
          raffleTitle: raffle.title,
          priceInCents: raffle.priceInCents,
          cards,
        }),
      removeCard: (cardId) =>
        setCart((current) => {
          if (!current) return null
          const cards = current.cards.filter((card) => card.id !== cardId)
          return cards.length ? { ...current, cards } : null
        }),
      clearCart: () => setCart(null),
    }),
    [cart],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

function readStoredCart(): Cart | null {
  try {
    const value = localStorage.getItem(storageKey)
    if (!value) return null
    const result = cartSchema.safeParse(JSON.parse(value))
    return result.success ? result.data : null
  } catch {
    return null
  }
}
