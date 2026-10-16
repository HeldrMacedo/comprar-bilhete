import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../shared/api/http-client'
import type { Account, AccountRepository, CodeRequest, Profile } from '../domain/types'
import { accountRepository } from '../repository/account-repository'

export const accountKeys = { all: ['account'] as const, me: ['account', 'me'] as const }

// 401 em qualquer chamada que exige sessão (conta ou Minhas compras) derruba a sessão local.
export function handleAccountUnauthenticated(
  queryClient: QueryClient,
  error: unknown,
  queryKey: readonly unknown[] | undefined,
) {
  if (!(error instanceof ApiError) || error.status !== 401) return
  if (queryKey?.[0] !== accountKeys.all[0] && queryKey?.[0] !== 'purchases') return
  queryClient.setQueryData(accountKeys.me, null)
}

export function createAccountHooks(repository: AccountRepository) {
  function useSignedIn() {
    const queryClient = useQueryClient()
    return (account: Account) => queryClient.setQueryData(accountKeys.me, account)
  }

  return {
    useAccount() {
      return useQuery({
        queryKey: accountKeys.me,
        queryFn: ({ signal }) => repository.getMe(signal),
        retry: false,
        staleTime: 60_000,
      })
    },
    useIdentify() {
      return useMutation({ mutationFn: (cpf: string) => repository.identify(cpf) })
    },
    useRequestCode() {
      return useMutation({ mutationFn: (request: CodeRequest) => repository.requestCode(request) })
    },
    useLogin() {
      const signedIn = useSignedIn()
      return useMutation({
        mutationFn: ({ cpf, password }: { cpf: string; password: string }) =>
          repository.login(cpf, password),
        onSuccess: signedIn,
      })
    },
    useRegister() {
      const signedIn = useSignedIn()
      return useMutation({
        mutationFn: (input: { customer: Profile; password: string; code: string }) =>
          repository.register(input),
        onSuccess: signedIn,
      })
    },
    useSetPassword() {
      const signedIn = useSignedIn()
      return useMutation({
        mutationFn: (input: { cpf: string; code: string; password: string; email?: string }) =>
          repository.setPassword(input),
        onSuccess: signedIn,
      })
    },
    useUpdateProfile() {
      const signedIn = useSignedIn()
      return useMutation({
        mutationKey: accountKeys.all,
        mutationFn: (input: { customer: Omit<Profile, 'cpf'>; currentPassword: string }) =>
          repository.updateProfile(input),
        onSuccess: signedIn,
      })
    },
    useLogout() {
      const queryClient = useQueryClient()
      return useMutation({
        mutationFn: () => repository.logout(),
        onSuccess: () => {
          queryClient.setQueryData(accountKeys.me, null)
          queryClient.removeQueries({ queryKey: ['purchases'] })
        },
      })
    },
  }
}

export const {
  useAccount,
  useIdentify,
  useRequestCode,
  useLogin,
  useRegister,
  useSetPassword,
  useUpdateProfile,
  useLogout,
} = createAccountHooks(accountRepository)
