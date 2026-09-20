import type { RaffleCard } from '../../raffle/domain/types'

export type Cart = {
  raffleId: string
  raffleTitle: string
  priceInCents: number
  cards: RaffleCard[]
}
