import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../shared/api/http-client'
import type { Account } from '../domain/types'
import { accountKeys, handleAccountUnauthenticated } from './account-queries'

const account: Account = {
  cpf: '52998224725',
  name: 'Maria da Silva',
  email: 'maria@example.com',
  phone: '84999855367',
  complete: true,
}

function setup() {
  const queryClient = new QueryClient()
  queryClient.setQueryData(accountKeys.me, account)
  return queryClient
}

const unauthenticated = new ApiError('Entre na sua conta.', 401, 'UNAUTHENTICATED')

describe('handleAccountUnauthenticated', () => {
  it('zera a sessão em 401 UNAUTHENTICATED da conta', () => {
    const queryClient = setup()
    handleAccountUnauthenticated(queryClient, unauthenticated, ['account', 'me'])
    expect(queryClient.getQueryData(accountKeys.me)).toBeNull()
  })

  it('mantém a sessão em 401 INVALID_CREDENTIALS', () => {
    const queryClient = setup()
    const error = new ApiError('Senha atual incorreta.', 401, 'INVALID_CREDENTIALS')
    handleAccountUnauthenticated(queryClient, error, ['account'])
    expect(queryClient.getQueryData(accountKeys.me)).toEqual(account)
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
