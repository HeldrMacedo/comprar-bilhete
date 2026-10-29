import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../shared/api/http-client'
import type { Account, AccountRepository, CodeRequest, Profile } from '../domain/types'
import { accountRepository } from '../repository/account-repository'

export const accountKeys = { all: ['account'] as const, me: ['account', 'me'] as const }
const purchasesKey = ['purchases'] as const

// Troca de identidade: as compras em cache são do dono anterior e não podem ser mostradas.
function resetAccountCache(queryClient: QueryClient, account: Account | null) {
  queryClient.setQueryData(accountKeys.me, account)
  queryClient.removeQueries({ queryKey: purchasesKey })
}

// 401 UNAUTHENTICATED em chamada que exige sessão (conta ou Minhas compras) derruba a sessão local.
// Outros 401 (ex.: senha atual errada, INVALID_CREDENTIALS) não encerram a sessão.
export function handleAccountUnauthenticated(
  queryClient: QueryClient,
  error: unknown,
  queryKey: readonly unknown[] | undefined,
) {
  if (!(error instanceof ApiError) || error.status !== 401 || error.code !== 'UNAUTHENTICATED') {
    return
  }
  if (queryKey?.[0] !== accountKeys.all[0] && queryKey?.[0] !== purchasesKey[0]) return
  resetAccountCache(queryClient, null)
}

export function createAccountHooks(repository: AccountRepository) {
  function useSignedIn() {
    const queryClient = useQueryClient()
    return (account: Account) => resetAccountCache(queryClient, account)
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
        mutationFn: (input: { customer: Profile; password: string }) => repository.register(input),
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
    useZipCodeLookup() {
      return useMutation({ mutationFn: (zipCode: string) => repository.lookupZipCode(zipCode) })
    },
    useLogout() {
      const queryClient = useQueryClient()
      return useMutation({
        mutationFn: () => repository.logout(),
        onSuccess: () => resetAccountCache(queryClient, null),
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
  useZipCodeLookup,
} = createAccountHooks(accountRepository)
