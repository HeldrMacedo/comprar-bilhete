import type { RaffleCard } from '../domain/types'

export function selectRandomCards(cards: RaffleCard[], quantity: number, random = Math.random) {
  const available = cards.filter((card) => card.available)
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Quantidade inválida.')
  if (quantity > available.length) throw new Error('Não há cartelas suficientes disponíveis.')

  return [...available]
    .map((card) => ({ card, order: random() }))
    .sort((a, b) => a.order - b.order)
    .slice(0, quantity)
    .map(({ card }) => card)
}
