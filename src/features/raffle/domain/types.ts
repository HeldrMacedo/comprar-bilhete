export type RaffleCard = {
  id: string
  code: string
  numbers: number[]
  available: boolean
}

export type Raffle = {
  id: string
  title: string
  description: string
  prize: string
  drawDate: string
  priceInCents: number
  cards: RaffleCard[]
}
