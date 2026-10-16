import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '../features/account/domain/types'
import { accountRepository } from '../features/account/repository/account-repository'
import { RequireAccount } from '../features/account/ui/RequireAccount'
import { AccountPage } from './AccountPage'
import { LoginPage } from './LoginPage'

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
  address: {
    zipCode: '59062300',
    street: 'AVENIDA LIMA E SILVA',
    number: '129',
    neighborhood: 'NAZARE',
    city: 'NATAL',
    state: 'RN',
  },
  complete: true,
}

function CurrentPath() {
  const location = useLocation()
  return <p data-testid="path">{`${location.pathname}${location.search}`}</p>
}

function renderAt(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/entrar" element={<LoginPage />} />
          <Route
            path="/minha-conta"
            element={
              <RequireAccount>
                <AccountPage />
              </RequireAccount>
            }
          />
          <Route path="*" element={null} />
        </Routes>
        <CurrentPath />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('entra e volta para o destino pedido', async () => {
    vi.mocked(accountRepository.getMe).mockResolvedValue(null)
    vi.mocked(accountRepository.identify).mockResolvedValue({ status: 'account' })
    vi.mocked(accountRepository.login).mockResolvedValue(account)
    renderAt('/entrar?next=%2Fcarrinho')
    expect(screen.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible()
    await userEvent.type(await screen.findByLabelText('CPF', { exact: true }), '52998224725')
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await userEvent.type(await screen.findByLabelText('Senha'), 'senha-maria-1')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await vi.waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/carrinho$/))
  })

  it('com sessão vai direto ao destino, ignorando destino externo', async () => {
    vi.mocked(accountRepository.getMe).mockResolvedValue(account)
    renderAt('/entrar?next=%2F%2Fevil.example')
    await vi.waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/))
  })
})

describe('AccountPage', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('sem sessão manda para /entrar com o destino', async () => {
    vi.mocked(accountRepository.getMe).mockResolvedValue(null)
    renderAt('/minha-conta?next=/carrinho')
    await vi.waitFor(() =>
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/entrar?next=%2Fminha-conta%3Fnext%3D%2Fcarrinho',
      ),
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible()
  })

  it('mostra os dados da conta, salva com a senha atual e confirma', async () => {
    vi.mocked(accountRepository.getMe).mockResolvedValue(account)
    vi.mocked(accountRepository.updateProfile).mockResolvedValue({ ...account, name: 'Maria S.' })
    renderAt('/minha-conta')
    expect(await screen.findByLabelText('Nome completo')).toHaveValue('Maria da Silva')
    expect(screen.getByLabelText('CPF')).toHaveValue('529.982.247-25')
    expect(screen.getByLabelText('CPF')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Celular com DDD')).toHaveValue('(84) 99985-5367')
    expect(screen.getByLabelText('Endereco')).toHaveValue('AVENIDA LIMA E SILVA')

    await userEvent.click(screen.getByRole('button', { name: 'Salvar dados' }))
    expect(await screen.findByText('Informe sua senha atual para salvar.')).toBeVisible()
    expect(accountRepository.updateProfile).not.toHaveBeenCalled()

    await userEvent.clear(screen.getByLabelText('Nome completo'))
    await userEvent.type(screen.getByLabelText('Nome completo'), 'Maria S.')
    await userEvent.type(screen.getByLabelText('Senha atual'), 'senha-maria-1')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar dados' }))
    expect(await screen.findByText('Dados atualizados.')).toBeVisible()
    expect(accountRepository.updateProfile).toHaveBeenCalledWith({
      customer: {
        name: 'Maria S.',
        phone: '84999855367',
        email: 'maria@example.com',
        address: account.address,
      },
      currentPassword: 'senha-maria-1',
    })
    expect(screen.getByLabelText('Senha atual')).toHaveValue('')
  })

  it('mostra o erro ao salvar e mantém o formulário', async () => {
    vi.mocked(accountRepository.getMe).mockResolvedValue(account)
    vi.mocked(accountRepository.updateProfile).mockRejectedValue(
      new Error('Senha atual incorreta.'),
    )
    renderAt('/minha-conta')
    await userEvent.type(await screen.findByLabelText('Senha atual'), 'senha-errada')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar dados' }))
    expect(await screen.findByText('Senha atual incorreta.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Salvar dados' })).toBeVisible()
  })

  it('depois de salvar volta para o destino pedido', async () => {
    vi.mocked(accountRepository.getMe).mockResolvedValue({ ...account, complete: false })
    vi.mocked(accountRepository.updateProfile).mockResolvedValue(account)
    renderAt('/minha-conta?next=/carrinho')
    await userEvent.type(await screen.findByLabelText('Senha atual'), 'senha-maria-1')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar dados' }))
    await vi.waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/carrinho$/))
  })
})
