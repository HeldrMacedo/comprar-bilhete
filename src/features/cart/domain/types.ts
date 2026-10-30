import type { RaffleCard } from '../../raffle/domain/types'

export type CartEntry = {
  raffleId: string
  raffleTitle: string
  priceInCents: number
  salesEndAt?: string
  selection: CartSelection
}

export type Cart = { entries: CartEntry[] }

export type CartSelection =
  { mode: 'manual'; cards: RaffleCard[] } | { mode: 'random'; quantity: number }
