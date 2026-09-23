import type { RaffleCard } from '../../raffle/domain/types'

export type Cart = {
  raffleId: string
  raffleTitle: string
  priceInCents: number
  selection: CartSelection
}

export type CartSelection =
  { mode: 'manual'; cards: RaffleCard[] } | { mode: 'random'; quantity: number }
