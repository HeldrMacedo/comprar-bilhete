import { requestJson } from '../../../shared/api/http-client'
import { apiRoutes } from '../../../shared/config/api-routes'
import { env } from '../../../shared/config/env'
import { activeRafflesSchema, cardsSchema } from '../api/schemas'
import type { Raffle, RaffleCard } from '../domain/types'

export interface RaffleRepository {
  getActive(): Promise<Raffle[]>
}

const mockCards: RaffleCard[] = Array.from({ length: 48 }, (_, index) => ({
  id: `card-${String(index + 1).padStart(3, '0')}`,
  code: `#${String(index + 1).padStart(3, '0')}`,
  numbers: Array.from(
    { length: 10 },
    (__, numberIndex) => ((index * 7 + numberIndex * 13) % 90) + 1,
  ).sort((a, b) => a - b),
  secondChanceNumbers: Array.from(
    { length: 10 },
    (__, numberIndex) => ((index * 11 + numberIndex * 17) % 90) + 1,
  ).sort((a, b) => a - b),
  available: ![5, 12, 21, 33].includes(index + 1),
}))

const mockRaffle: Raffle = {
  id: 'sorteio-setembro',
  title: 'Sorteio Especial de Setembro',
  description: 'Escolha sua cartela da sorte e concorra no próximo sorteio.',
  prize: 'R$ 10.000 em prêmios',
  drawDate: '2026-09-30T21:00:00.000Z',
  priceInCents: 1000,
  prizes: ['1 AVELLOZ AZ1', '1 AVELLOZ AZ1', '1 AVELLOZ AZ1', '1 HONDA START 160 + 20 MIL'],
  luckySpins: { count: 10, label: 'R$ 300,00' },
  doubleChance: true,
  cards: mockCards,
}

const mockSundayRaffle: Raffle = {
  id: 'sorteio-domingo',
  title: 'Sorteio de Domingo',
  description: 'Escolha sua cartela para o sorteio de domingo.',
  prize: 'R$ 5.000 em prêmios',
  drawDate: '2026-10-04T23:00:00.000Z',
  priceInCents: 600,
  prizes: ['R$: 3 MIL REAIS', 'R$: 3 MIL REAIS', 'R$: 3 MIL REAIS', '1 HONDA BROS 160 0KM'],
  doubleChance: true,
  cards: mockCards,
}

const mockRepository: RaffleRepository = {
  async getActive() {
    await delay(250)
    return structuredClone([mockRaffle, mockSundayRaffle])
  },
}

const liveRepository: RaffleRepository = {
  async getActive() {
    const raffles = await requestJson(apiRoutes.activeRaffle, activeRafflesSchema)
    return Promise.all(
      raffles.map(async (raffle) => ({
        ...raffle,
        cards: await requestJson(apiRoutes.availableCards(raffle.id), cardsSchema),
      })),
    )
  },
}

export const raffleRepository = env.VITE_API_MODE === 'live' ? liveRepository : mockRepository

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}
