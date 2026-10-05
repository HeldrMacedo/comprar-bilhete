export type RaffleCard = {
  id: string
  code: string
  numbers: number[]
  secondChanceNumbers?: number[]
  available: boolean
}

export type Raffle = {
  id: string
  title: string
  description: string
  prize: string
  drawDate: string
  priceInCents: number
  prizes?: string[]
  luckySpins?: { count: number; label: string }
  doubleChance?: boolean
  purchaseEnabled?: boolean
  cards: RaffleCard[]
}
