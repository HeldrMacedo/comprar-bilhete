import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CartProvider } from '../features/cart/runtime/CartProvider'
import type { Raffle } from '../features/raffle/domain/types'
import { raffleRepository } from '../features/raffle/repository/raffle-repository'
import { HomePage } from './HomePage'

vi.mock('../features/raffle/repository/raffle-repository', () => ({
  raffleRepository: { getActive: vi.fn() },
}))

function renderHomePage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

describe('HomePage sem concurso', () => {
  afterEach(cleanup)

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it.each([
    ['concurso ausente', new Error('Concurso não encontrado')],
    ['falha na API', new Error('Servidor indisponível')],
  ])('mantém o banner e informa indisponibilidade quando há %s', async (_scenario, error) => {
    vi.mocked(raffleRepository.getActive).mockRejectedValue(error)

    renderHomePage()

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Sem sorteios ativo no momento' },
        { timeout: 5_000 },
      ),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: /Seu próximo número pode mudar tudo/i }),
    ).toBeVisible()
    expect(screen.queryByText('Sorteio aberto')).not.toBeInTheDocument()
    expect(screen.queryByText('Prêmio principal')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ir para o carrinho/i })).not.toBeInTheDocument()
  })

  it('permite escolher quarta e domingo no mesmo carrinho com total somado', async () => {
    const cards = [{ id: 'card-001', code: '#001', numbers: [1, 2, 3], available: true }]
    const raffles: Raffle[] = [
      {
        id: '2026040',
        title: 'Sorteio de Quarta',
        description: 'Sorteio de quarta-feira',
        prize: 'R$ 10.000',
        drawDate: '2026-09-30T21:00:00.000Z',
        priceInCents: 1000,
        cards,
      },
      {
        id: '2026041',
        title: 'Sorteio de Domingo',
        description: 'Sorteio de domingo',
        prize: 'R$ 5.000',
        drawDate: '2026-10-04T23:00:00.000Z',
        priceInCents: 600,
        cards,
      },
    ]
    vi.mocked(raffleRepository.getActive).mockResolvedValue(raffles)

    renderHomePage()

    expect(await screen.findByRole('checkbox', { name: /quarta-feira/i })).toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: /domingo/i }))
    expect(screen.getByRole('checkbox', { name: /domingo/i })).toBeChecked()
    expect(screen.getByText('R$ 16,00')).toBeVisible()
    expect(screen.getByRole('button', { name: /Ir para o carrinho/i })).toBeEnabled()
  })

  it('mostra o concurso HTTP para consulta sem permitir compra', async () => {
    vi.mocked(raffleRepository.getActive).mockResolvedValue([
      {
        id: '2026041',
        title: 'Sorteio de Domingo',
        description: 'Sorteio de domingo',
        prize: 'R$ 5.000',
        drawDate: '2026-10-04T23:00:00.000Z',
        priceInCents: 600,
        purchaseEnabled: false,
        cards: [{ id: 'card-001', code: '#001', numbers: [1, 2, 3], available: true }],
      },
    ])
    renderHomePage()
    expect(await screen.findByRole('checkbox', { name: /domingo/i })).toBeChecked()
    expect(screen.getByText(/apenas para consulta/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /Ir para o carrinho/i })).toBeDisabled()
  })
})
