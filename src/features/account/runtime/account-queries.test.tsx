import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/api/http-client'
import type { Account, AccountRepository } from '../domain/types'
import { accountKeys, createAccountHooks, handleAccountUnauthenticated } from './account-queries'

const account: Account = {
  cpf: '52998224725',
  name: 'Maria da Silva',
  email: 'maria@example.com',
  phone: '84999855367',
  complete: true,
}

const purchasesKey = ['purchases', 'mine']

function setup() {
  const queryClient = new QueryClient()
  queryClient.setQueryData(accountKeys.me, account)
  queryClient.setQueryData(purchasesKey, [{ id: 'compra-da-maria' }])
  return queryClient
}

const unauthenticated = new ApiError('Entre na sua conta.', 401, 'UNAUTHENTICATED')

describe('handleAccountUnauthenticated', () => {
  it('zera a sessão em 401 UNAUTHENTICATED da conta', () => {
    const queryClient = setup()
    handleAccountUnauthenticated(queryClient, unauthenticated, ['account', 'me'])
    expect(queryClient.getQueryData(accountKeys.me)).toBeNull()
    expect(queryClient.getQueryData(purchasesKey)).toBeUndefined()
  })

  it('mantém a sessão em 401 INVALID_CREDENTIALS', () => {
    const queryClient = setup()
    const error = new ApiError('Senha atual incorreta.', 401, 'INVALID_CREDENTIALS')
    handleAccountUnauthenticated(queryClient, error, ['account'])
    expect(queryClient.getQueryData(accountKeys.me)).toEqual(account)
    expect(queryClient.getQueryData(purchasesKey)).toBeDefined()
  })

  it('zera a sessão em 401 UNAUTHENTICATED de Minhas compras', () => {
    const queryClient = setup()
    handleAccountUnauthenticated(queryClient, unauthenticated, ['purchases', 'mine'])
    expect(queryClient.getQueryData(accountKeys.me)).toBeNull()
  })

  it('ignora 401 de chave não relacionada', () => {
    const queryClient = setup()
    handleAccountUnauthenticated(queryClient, unauthenticated, ['raffle', 'active'])
    expect(queryClient.getQueryData(accountKeys.me)).toEqual(account)
  })
})

describe('troca de conta', () => {
  it('entrar com outra conta descarta Minhas compras da sessão anterior', async () => {
    const joao: Account = { ...account, cpf: '39053344705', name: 'João Souza' }
    const repository: AccountRepository = {
      getMe: vi.fn(),
      identify: vi.fn(),
      requestCode: vi.fn(),
      login: vi.fn().mockResolvedValue(joao),
      register: vi.fn(),
      setPassword: vi.fn(),
      updateProfile: vi.fn(),
      logout: vi.fn(),
    }
    const queryClient = setup()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => createAccountHooks(repository).useLogin(), { wrapper })

    await act(() => result.current.mutateAsync({ cpf: joao.cpf, password: 'senha-joao-1' }))

    expect(queryClient.getQueryData(accountKeys.me)).toEqual(joao)
    expect(queryClient.getQueryData(purchasesKey)).toBeUndefined()
  })
})
