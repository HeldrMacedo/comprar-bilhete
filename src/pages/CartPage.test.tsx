import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const mariaAddress = {
  zipCode: '59062300',
  street: 'Avenida Lima e Silva',
  number: '129',
  neighborhood: 'Nazare',
  city: 'Natal',
  state: 'RN',
}

function renderCartPage(initialCart: Cart = cart) {
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

  afterEach(cleanup)

  it('consulta pelo CPF, preenche cliente existente e mantém telefone ausente editável', async () => {
    const { customerRepository } =
      await import('../features/checkout/repository/customer-repository')
    vi.mocked(customerRepository.lookup).mockResolvedValue({
      found: true,
      customer: {
        externalId: '2015',
        name: 'Maria da Silva',
        cpf: '52998224725',
        phone: '',
      },
    })
    renderCartPage()
    expect(screen.getByRole('heading', { name: 'Sorteio de Quarta' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Sorteio de Domingo' })).toBeVisible()
    expect(screen.getAllByText('R$ 16,00')[0]).toBeVisible()
    await userEvent.type(screen.getByLabelText('CPF'), '52998224725')
    expect(await screen.findByText('Cliente encontrado')).toBeVisible()
    expect(screen.getByLabelText('Nome completo')).toHaveValue('Maria da Silva')
    expect(screen.getByLabelText('CPF')).toBeEnabled()
    expect(screen.getByLabelText('Celular com DDD')).toHaveValue('')
    expect(customerRepository.lookup).toHaveBeenCalledWith(
      { cpf: '52998224725' },
      expect.anything(),
    )
    expect(screen.getByLabelText('CEP')).toBeRequired()
  })

  it('mostra endereco do cliente existente para revisao e envia a alteracao', async () => {
    const { customerRepository } =
      await import('../features/checkout/repository/customer-repository')
    const { checkoutRepository } =
      await import('../features/checkout/repository/checkout-repository')
    vi.mocked(customerRepository.lookup).mockResolvedValue({
      found: true,
      customer: {
        externalId: '2015',
        name: 'Maria da Silva',
        cpf: '52998224725',
        phone: '84999855367',
        address: mariaAddress,
      },
    })
    vi.mocked(checkoutRepository.createOrder).mockRejectedValue(new Error('parar aqui'))
    renderCartPage()
    await userEvent.type(screen.getByLabelText('CPF'), '52998224725')
    expect(await screen.findByText('Cliente encontrado')).toBeVisible()
    expect(screen.getByLabelText('Endereco')).toHaveValue('Avenida Lima e Silva')

    await userEvent.clear(screen.getByLabelText('Numero'))
    await userEvent.type(screen.getByLabelText('Numero'), '45')
    await userEvent.click(screen.getByRole('button', { name: /continuar para o pix/i }))
    await vi.waitFor(() => expect(checkoutRepository.createOrder).toHaveBeenCalledTimes(1))
    expect(vi.mocked(checkoutRepository.createOrder).mock.calls[0]?.[0].customer.address).toEqual(
      expect.objectContaining({ street: 'AVENIDA LIMA E SILVA', number: '45' }),
    )
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

  it('mostra CPF e celular antes do nome', () => {
    renderCartPage()
    const inputs = screen.getAllByRole('textbox').map((input) => input.id)
    expect(inputs.slice(0, 3)).toEqual(['cpf', 'phone', 'name'])
  })

  it('pede o nome do terceiro somente quando a compra é para outra pessoa', async () => {
    const { customerRepository } =
      await import('../features/checkout/repository/customer-repository')
    const { checkoutRepository } =
      await import('../features/checkout/repository/checkout-repository')
    vi.mocked(customerRepository.lookup).mockResolvedValue({
      found: true,
      customer: {
        externalId: '2015',
        name: 'Maria da Silva',
        cpf: '52998224725',
        phone: '84999855367',
        address: mariaAddress,
      },
    })
    vi.mocked(checkoutRepository.createOrder).mockRejectedValue(new Error('parar aqui'))
    renderCartPage()
    expect(screen.queryByLabelText('Nome de quem vai concorrer')).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('CPF'), '52998224725')
    expect(await screen.findByText('Cliente encontrado')).toBeVisible()
    await userEvent.click(screen.getByLabelText('Estou comprando para outra pessoa'))
    await userEvent.click(screen.getByRole('button', { name: /continuar para o pix/i }))
    expect(await screen.findByText('Informe o nome completo de quem vai concorrer.')).toBeVisible()

    await userEvent.type(screen.getByLabelText('Nome de quem vai concorrer'), 'João Terceiro')
    await userEvent.click(screen.getByRole('button', { name: /continuar para o pix/i }))
    await vi.waitFor(() => expect(checkoutRepository.createOrder).toHaveBeenCalledTimes(1))
    expect(vi.mocked(checkoutRepository.createOrder).mock.calls[0]?.[0].customer).toEqual({
      name: 'Maria da Silva',
      cpf: '52998224725',
      phone: '+5584999855367',
      address: {
        ...mariaAddress,
        street: 'AVENIDA LIMA E SILVA',
        neighborhood: 'NAZARE',
        city: 'NATAL',
      },
      beneficiaryName: 'João Terceiro',
    })
  })

  it('diminui a quantidade da surpresinha sem passar de uma cartela', async () => {
    renderCartPage()
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
    renderCartPage({ entries })
    await userEvent.click(
      screen.getByRole('button', { name: 'Diminuir quantidade de Sorteio de Domingo' }),
    )
    expect(screen.getByText(/2 cartela\(s\) serão sorteadas/)).toBeVisible()
    expect(screen.getAllByText('R$ 22,00')[0]).toBeVisible()
  })

  it('remove a surpresinha e esvazia o carrinho', async () => {
    renderCartPage()
    await userEvent.click(
      screen.getByRole('button', { name: 'Remover cartelas de Sorteio de Domingo' }),
    )
    expect(screen.queryByRole('heading', { name: 'Sorteio de Domingo' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sorteio de Quarta' })).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: /esvaziar carrinho/i }))
    expect(screen.getByRole('heading', { name: 'Seu carrinho esta vazio' })).toBeVisible()
    expect(localStorage.getItem('bilhete-da-sorte:cart:v3')).toBeNull()
  })

  it('esvazia o carrinho ao entregar o pedido para o pagamento', async () => {
    const { customerRepository } =
      await import('../features/checkout/repository/customer-repository')
    const { checkoutRepository } =
      await import('../features/checkout/repository/checkout-repository')
    vi.mocked(customerRepository.lookup).mockResolvedValue({
      found: true,
      customer: {
        externalId: '2015',
        name: 'Maria da Silva',
        cpf: '52998224725',
        phone: '84999855367',
        address: mariaAddress,
      },
    })
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
      renderCartPage()
      await userEvent.type(screen.getByLabelText('CPF'), '52998224725')
      expect(await screen.findByText('Cliente encontrado')).toBeVisible()
      await userEvent.click(screen.getByRole('button', { name: /continuar para o pix/i }))

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
