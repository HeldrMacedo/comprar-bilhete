import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '../features/account/domain/types'
import { accountRepository } from '../features/account/repository/account-repository'
import { CartProvider } from '../features/cart/runtime/CartProvider'
import type { Cart } from '../features/cart/domain/types'
import { checkoutRepository } from '../features/checkout/repository/checkout-repository'
import { CartPage } from './CartPage'

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

vi.mock('../features/account/repository/account-repository', () => ({
  accountRepository: {
    getMe: vi.fn(),
    identify: vi.fn(),
    requestCode: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    setPassword: vi.fn(),
    updateProfile: vi.fn(),
    logout: vi.fn(),
  },
}))

vi.mock('../features/checkout/repository/checkout-repository', () => ({
  checkoutRepository: {
    createOrder: vi.fn(),
    createCheckout: vi.fn(),
    getOrder: vi.fn(),
  },
}))

const address = {
  zipCode: '59062300',
  street: 'AVENIDA LIMA E SILVA',
  number: '129',
  neighborhood: 'NAZARE',
  city: 'NATAL',
  state: 'RN',
}

const account: Account = {
  cpf: '52998224725',
  name: 'Maria da Silva',
  email: 'maria@example.com',
  phone: '84999855367',
  complete: true,
}

function renderCart(initialCart: Cart = cart) {
  localStorage.setItem('bilhete-da-sorte:cart:v3', JSON.stringify(initialCart))
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <MemoryRouter initialEntries={['/carrinho']}>
      <QueryClientProvider client={queryClient}>
        <CartProvider>
          <Routes>
            <Route path="/carrinho" element={<CartPage />} />
            <Route path="/" element={<h1>Início</h1>} />
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
    vi.mocked(accountRepository.getMe).mockResolvedValue({ ...account, address })
  })

  afterEach(cleanup)

  it('sem sessão mostra o fluxo de entrar no lugar dos dados do comprador', async () => {
    vi.mocked(accountRepository.getMe).mockResolvedValue(null)
    renderCart()
    expect(await screen.findByLabelText('CPF', { exact: true })).toBeVisible()
    expect(screen.queryByRole('button', { name: /continuar para o pix/i })).not.toBeInTheDocument()
  })

  it('com sessão mostra o resumo da conta e cria o pedido sem dados pessoais no corpo', async () => {
    vi.mocked(accountRepository.getMe).mockResolvedValue({ ...account, address })
    vi.mocked(checkoutRepository.createOrder).mockRejectedValue(new Error('parar aqui'))
    renderCart()
    expect(await screen.findByText('Maria da Silva')).toBeVisible()
    expect(screen.getByText('529.982.247-25')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute(
      'href',
      '/minha-conta?next=/carrinho',
    )
    expect(screen.getByLabelText('Email')).toHaveValue('maria@example.com')
    await userEvent.click(screen.getByRole('button', { name: /continuar para o pix/i }))
    expect(checkoutRepository.createOrder).toHaveBeenCalledWith({
      raffles: expect.any(Array),
      email: 'maria@example.com',
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('parar aqui')
  })

  it('conta incompleta pede para completar o cadastro', async () => {
    vi.mocked(accountRepository.getMe).mockResolvedValue({ ...account, complete: false })
    renderCart()
    expect(await screen.findByRole('link', { name: /completar meus dados/i })).toHaveAttribute(
      'href',
      '/minha-conta?next=/carrinho',
    )
    expect(screen.queryByRole('button', { name: /continuar para o pix/i })).not.toBeInTheDocument()
  })

  it('pede o nome do terceiro somente quando a compra é para outra pessoa', async () => {
    vi.mocked(checkoutRepository.createOrder).mockRejectedValue(new Error('parar aqui'))
    renderCart()
    expect(await screen.findByText('Maria da Silva')).toBeVisible()
    expect(screen.queryByLabelText('Nome de quem vai concorrer')).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Estou comprando para outra pessoa'))
    await userEvent.click(screen.getByRole('button', { name: /continuar para o pix/i }))
    expect(await screen.findByText('Informe o nome completo de quem vai concorrer.')).toBeVisible()
    expect(checkoutRepository.createOrder).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Nome de quem vai concorrer'), 'João Terceiro')
    await userEvent.click(screen.getByRole('button', { name: /continuar para o pix/i }))
    await vi.waitFor(() => expect(checkoutRepository.createOrder).toHaveBeenCalledTimes(1))
    expect(checkoutRepository.createOrder).toHaveBeenCalledWith({
      raffles: expect.any(Array),
      email: 'maria@example.com',
      beneficiaryName: 'João Terceiro',
    })
  })

  it('sessão expirada ao criar o pedido volta para o fluxo de entrar', async () => {
    const { ApiError } = await import('../shared/api/http-client')
    vi.mocked(checkoutRepository.createOrder).mockRejectedValue(
      new ApiError('Entre na sua conta para continuar.', 401, 'UNAUTHENTICATED'),
    )
    renderCart()
    await userEvent.click(await screen.findByRole('button', { name: /continuar para o pix/i }))
    expect(await screen.findByLabelText('CPF', { exact: true })).toBeVisible()
    expect(screen.queryByRole('button', { name: /continuar para o pix/i })).not.toBeInTheDocument()

    vi.mocked(accountRepository.identify).mockResolvedValue({ status: 'account' })
    vi.mocked(accountRepository.login).mockResolvedValue({ ...account, address })
    await userEvent.type(screen.getByLabelText('CPF', { exact: true }), '52998224725')
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await userEvent.type(await screen.findByLabelText('Senha'), 'senha-maria-1')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('button', { name: /continuar para o pix/i })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('volta ao início e esvazia o carrinho quando os bilhetes não estão mais disponíveis', async () => {
    const { ApiError } = await import('../shared/api/http-client')
    vi.mocked(checkoutRepository.createOrder).mockRejectedValue(
      new ApiError('Bilhete reservado.', 409, 'TICKET_RESERVED'),
    )
    renderCart()
    await userEvent.click(await screen.findByRole('button', { name: /continuar para o pix/i }))
    expect(await screen.findByRole('heading', { name: 'Início' })).toBeVisible()
    expect(localStorage.getItem('bilhete-da-sorte:cart:v3')).toBeNull()
  })

  it('diminui a quantidade da surpresinha sem passar de um bilhete', async () => {
    renderCart()
    const decrease = screen.getByRole('button', {
      name: 'Diminuir quantidade de Sorteio de Domingo',
    })
    expect(decrease).toBeDisabled()
    cleanup()

    localStorage.clear()
    const entries = [
      cart.entries[0]!,
      { ...cart.entries[1]!, selection: { mode: 'random' as const, quantity: 3 } },
    ]
    renderCart({ entries })
    await userEvent.click(
      screen.getByRole('button', { name: 'Diminuir quantidade de Sorteio de Domingo' }),
    )
    expect(screen.getByText(/2 bilhete\(s\) serão sorteadas/)).toBeVisible()
    expect(screen.getAllByText('R$ 22,00')[0]).toBeVisible()
  })

  it('remove a surpresinha e esvazia o carrinho', async () => {
    renderCart()
    expect(screen.getByRole('heading', { name: 'Sorteio de Quarta' })).toBeVisible()
    expect(screen.getAllByText('R$ 16,00')[0]).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Remover bilhetes de Sorteio de Domingo' }),
    )
    expect(screen.queryByRole('heading', { name: 'Sorteio de Domingo' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sorteio de Quarta' })).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: /esvaziar carrinho/i }))
    expect(screen.getByRole('heading', { name: 'Seu carrinho esta vazio' })).toBeVisible()
    expect(localStorage.getItem('bilhete-da-sorte:cart:v3')).toBeNull()
  })

  it('esvazia o carrinho ao entregar o pedido para o pagamento', async () => {
    vi.mocked(checkoutRepository.createOrder).mockResolvedValue({
      id: 'order-1',
      status: 'pending',
      totalInCents: 1600,
    })
    vi.mocked(checkoutRepository.createCheckout).mockResolvedValue({
      checkoutUrl: 'https://checkout.example/pix',
    })
    const assign = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign },
    })

    try {
      renderCart()
      await userEvent.click(await screen.findByRole('button', { name: /continuar para o pix/i }))

      await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.example/pix'))
      expect(localStorage.getItem('bilhete-da-sorte:cart:v3')).toBeNull()
      expect(screen.getByRole('link', { name: /abrir pagamento/i })).toHaveAttribute(
        'href',
        'https://checkout.example/pix',
      )
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    }
  })
})
