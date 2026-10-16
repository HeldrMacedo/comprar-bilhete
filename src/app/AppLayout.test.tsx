import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '../features/account/domain/types'
import { accountRepository } from '../features/account/repository/account-repository'
import { CartProvider } from '../features/cart/runtime/CartProvider'
import { AppLayout } from './AppLayout'

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

const account: Account = {
  cpf: '52998224725',
  name: 'Maria da Silva',
  email: 'maria@example.com',
  phone: '84999855367',
  complete: true,
}

function renderLayout(initialEntry = '/carrinho') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <CartProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<h1>Início</h1>} />
              <Route path="carrinho" element={<h1>Carrinho</h1>} />
            </Route>
          </Routes>
        </CartProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('AppLayout', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('mostra Entrar sem sessão e Minha conta com sessão', async () => {
    vi.mocked(accountRepository.getMe).mockResolvedValue(null)
    const { unmount } = renderLayout()
    expect(await screen.findByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar')
    unmount()

    vi.mocked(accountRepository.getMe).mockResolvedValue(account)
    renderLayout()
    await userEvent.click(await screen.findByRole('button', { name: /minha conta/i }))
    expect(screen.getByRole('menuitem', { name: 'Minhas compras' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Meus dados' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Sair' })).toBeVisible()
  })

  it('não mostra mais a busca de compras por CPF no cabeçalho', async () => {
    vi.mocked(accountRepository.getMe).mockResolvedValue(null)
    renderLayout()
    await screen.findByRole('link', { name: 'Entrar' })
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
  })

  it('menu da conta navega pelas setas, fecha com Esc e Sair encerra a sessão', async () => {
    vi.mocked(accountRepository.getMe).mockResolvedValue(account)
    vi.mocked(accountRepository.logout).mockResolvedValue()
    renderLayout()
    const button = await screen.findByRole('button', { name: /minha conta/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: 'Minhas compras' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Meus dados' })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Sair' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(button).toHaveFocus()

    await userEvent.click(button)
    await userEvent.click(screen.getByRole('heading', { name: 'Carrinho' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await userEvent.click(button)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sair' }))
    expect(accountRepository.logout).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('heading', { name: 'Início' })).toBeVisible()
    expect(await screen.findByRole('link', { name: 'Entrar' })).toBeVisible()
  })
})
