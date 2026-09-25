import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CartProvider } from '../features/cart/runtime/CartProvider'
import { CartPage } from './CartPage'
import type { Cart } from '../features/cart/domain/types'

const cart: Cart = {
  entries: [
    {
      raffleId: 'raffle-1',
      raffleTitle: 'Sorteio de Quarta',
      priceInCents: 1000,
      selection: {
        mode: 'manual',
        cards: [{ id: 'card-001', code: '#001', numbers: [1, 2, 3], available: true }],
      },
    },
    {
      raffleId: 'raffle-2',
      raffleTitle: 'Sorteio de Domingo',
      priceInCents: 600,
      selection: { mode: 'random', quantity: 1 },
    },
  ],
}

vi.mock('../features/checkout/repository/customer-repository', () => ({
  customerRepository: { lookup: vi.fn() },
}))

vi.mock('../features/checkout/repository/checkout-repository', () => ({
  checkoutRepository: {
    createOrder: vi.fn(),
    createCheckout: vi.fn(),
    getOrder: vi.fn(),
  },
}))

function renderCartPage() {
  localStorage.setItem('bilhete-da-sorte:cart:v3', JSON.stringify(cart))
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <MemoryRouter initialEntries={['/carrinho']}>
      <QueryClientProvider client={queryClient}>
        <CartProvider>
          <Routes>
            <Route path="/carrinho" element={<CartPage />} />
          </Routes>
        </CartProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('CartPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('preenche cliente existente e mantém campo ausente editável', async () => {
    const { customerRepository } =
      await import('../features/checkout/repository/customer-repository')
    vi.mocked(customerRepository.lookup).mockResolvedValue({
      found: true,
      customer: {
        externalId: '2015',
        name: 'Maria da Silva',
        cpf: '',
        phone: '84999855367',
      },
    })
    renderCartPage()
    expect(screen.getByRole('heading', { name: 'Sorteio de Quarta' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Sorteio de Domingo' })).toBeVisible()
    expect(screen.getAllByText('R$ 16,00')[0]).toBeVisible()
    await userEvent.type(screen.getByLabelText('Celular com DDD'), '84999855367')
    expect(await screen.findByText('Cliente encontrado')).toBeVisible()
    expect(screen.getByLabelText('Nome completo')).toHaveValue('Maria da Silva')
    expect(screen.getByLabelText('CPF')).toBeEnabled()
    expect(screen.queryByLabelText('CEP')).not.toBeInTheDocument()
  })

  it('mostra endereco obrigatorio para novo cliente', async () => {
    const { customerRepository } =
      await import('../features/checkout/repository/customer-repository')
    vi.mocked(customerRepository.lookup).mockResolvedValue({ found: false })
    renderCartPage()
    await userEvent.type(screen.getByLabelText('CPF'), '11144477735')
    expect((await screen.findAllByText('Complete seu endereco'))[0]).toBeVisible()
    expect(screen.getByLabelText('CEP')).toBeRequired()
  })
})
