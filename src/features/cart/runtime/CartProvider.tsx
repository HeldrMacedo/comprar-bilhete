import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { raffleCardSchema } from '../../raffle/api/schemas'
import type { Cart } from '../domain/types'
import { CartContext, type CartContextValue } from './cart-context'

const storageKey = 'bilhete-da-sorte:cart:v3'
const legacyStorageKey = 'bilhete-da-sorte:cart:v2'
const cartEntrySchema = z.object({
  raffleId: z.string(),
  raffleTitle: z.string(),
  priceInCents: z.number().int().positive(),
  selection: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('manual'), cards: z.array(raffleCardSchema).min(1) }),
    z.object({ mode: z.literal('random'), quantity: z.number().int().min(1).max(50) }),
  ]),
})
const cartSchema = z.object({ entries: z.array(cartEntrySchema).min(1).max(2) })

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(readStoredCart)

  useEffect(() => {
    if (cart) localStorage.setItem(storageKey, JSON.stringify(cart))
    else localStorage.removeItem(storageKey)
    localStorage.removeItem(legacyStorageKey)
  }, [cart])

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      itemCount:
        cart?.entries.reduce(
          (count, entry) =>
            count +
            (entry.selection.mode === 'manual'
              ? entry.selection.cards.length
              : entry.selection.quantity),
          0,
        ) ?? 0,
      totalInCents:
        cart?.entries.reduce(
          (total, entry) =>
            total +
            (entry.selection.mode === 'manual'
              ? entry.selection.cards.length
              : entry.selection.quantity) *
              entry.priceInCents,
          0,
        ) ?? 0,
      setSelections: (entries) =>
        setCart({
          entries: entries.map(({ raffle, selection }) => ({
            raffleId: raffle.id,
            raffleTitle: raffle.title,
            priceInCents: raffle.priceInCents,
            selection,
          })),
        }),
      removeCard: (raffleId, cardId) =>
        setCart((current) => {
          if (!current) return current
          const entries = current.entries.flatMap((entry) => {
            if (entry.raffleId !== raffleId || entry.selection.mode !== 'manual') return [entry]
            const cards = entry.selection.cards.filter((card) => card.id !== cardId)
            return cards.length ? [{ ...entry, selection: { mode: 'manual' as const, cards } }] : []
          })
          return entries.length ? { entries } : null
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
    if (value) {
      const result = cartSchema.safeParse(JSON.parse(value))
      if (result.success) return result.data
    }
    const legacy = localStorage.getItem(legacyStorageKey)
    if (!legacy) return null
    const result = cartEntrySchema.safeParse(JSON.parse(legacy))
    return result.success ? { entries: [result.data] } : null
  } catch {
    return null
  }
}
