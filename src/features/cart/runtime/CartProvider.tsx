import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { raffleCardSchema } from '../../raffle/api/schemas'
import type { Cart } from '../domain/types'
import { CartContext, type CartContextValue } from './cart-context'

const storageKey = 'bilhete-da-sorte:cart:v2'
const cartSchema = z.object({
  raffleId: z.string(),
  raffleTitle: z.string(),
  priceInCents: z.number().int().positive(),
  selection: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('manual'), cards: z.array(raffleCardSchema).min(1) }),
    z.object({ mode: z.literal('random'), quantity: z.number().int().min(1).max(50) }),
  ]),
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
      itemCount: cart
        ? cart.selection.mode === 'manual'
          ? cart.selection.cards.length
          : cart.selection.quantity
        : 0,
      totalInCents: cart
        ? (cart.selection.mode === 'manual'
            ? cart.selection.cards.length
            : cart.selection.quantity) * cart.priceInCents
        : 0,
      setSelection: (raffle, selection) =>
        setCart({
          raffleId: raffle.id,
          raffleTitle: raffle.title,
          priceInCents: raffle.priceInCents,
          selection,
        }),
      removeCard: (cardId) =>
        setCart((current) => {
          if (!current || current.selection.mode !== 'manual') return current
          const cards = current.selection.cards.filter((card) => card.id !== cardId)
          return cards.length ? { ...current, selection: { mode: 'manual', cards } } : null
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
