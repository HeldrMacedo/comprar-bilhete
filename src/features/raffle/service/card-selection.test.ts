import { describe, expect, it } from 'vitest'
import { selectRandomCards } from './card-selection'
import type { RaffleCard } from '../domain/types'

const cards: RaffleCard[] = [
  { id: '1', code: '#001', numbers: [1], available: true },
  { id: '2', code: '#002', numbers: [2], available: false },
  { id: '3', code: '#003', numbers: [3], available: true },
]

describe('selectRandomCards', () => {
  it('nunca seleciona uma cartela indisponível', () => {
    expect(selectRandomCards(cards, 2, () => 0).map((card) => card.id)).toEqual(['1', '3'])
  })

  it('rejeita quantidade maior que o estoque', () => {
    expect(() => selectRandomCards(cards, 3)).toThrow('Não há cartelas suficientes')
  })
})
