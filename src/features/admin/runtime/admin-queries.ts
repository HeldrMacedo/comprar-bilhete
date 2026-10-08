import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { ApiError } from '../../../shared/api/http-client'
import type {
  AdminCredentials,
  AdminRepository,
  CreateAdminUserInput,
  ContestSource,
  ContestValues,
  CustomerFilters,
  DownloadedFile,
  OrderAction,
  SalesFilters,
  UpdateAdminUserInput,
} from '../domain/types'
import { PAGE_SIZE } from '../service/list-params'
import { adminRepository } from '../repository/admin-repository'

export const adminKeys = {
  all: ['admin'] as const,
  session: ['admin', 'session'] as const,
  users: ['admin', 'users'] as const,
  orders: ['admin', 'orders'] as const,
  customers: ['admin', 'customers'] as const,
  dashboard: ['admin', 'dashboard'] as const,
  raffles: ['admin', 'raffles'] as const,
  settings: ['admin', 'settings'] as const,
}

export function saveDownloadedFile({ blob, fileName }: DownloadedFile) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

// Chamado pelos caches globais: 401 em qualquer consulta do painel derruba a sessão local.
export function handleAdminUnauthenticated(
  queryClient: QueryClient,
  error: unknown,
  queryKey: readonly unknown[] | undefined,
) {
  if (!(error instanceof ApiError) || error.status !== 401) return
  if (queryKey?.[0] !== adminKeys.all[0]) return
  queryClient.setQueryData(adminKeys.session, null)
}

export function createAdminHooks(repository: AdminRepository) {
  function useAdminSession() {
    return useQuery({
      queryKey: adminKeys.session,
      queryFn: ({ signal }) => repository.getSession(signal),
      retry: false,
      staleTime: 60_000,
    })
  }

  function useAdminLogin() {
    const queryClient = useQueryClient()
    return useMutation({
      mutationKey: adminKeys.all,
      mutationFn: (credentials: AdminCredentials) => repository.login(credentials),
      onSuccess: (user) => queryClient.setQueryData(adminKeys.session, user),
    })
  }

  function useAdminLogout() {
    const queryClient = useQueryClient()
    return useMutation({
      mutationKey: adminKeys.all,
      mutationFn: () => repository.logout(),
      onSettled: () => {
        queryClient.removeQueries({ queryKey: adminKeys.all })
        queryClient.setQueryData(adminKeys.session, null)
      },
    })
  }

  function useAdminUsers() {
    return useQuery({
      queryKey: adminKeys.users,
      queryFn: ({ signal }) => repository.listUsers(signal),
      retry: false,
    })
  }

  function useSaveAdminUser() {
    const queryClient = useQueryClient()
    return useMutation({
      mutationKey: adminKeys.all,
      mutationFn: (
        input:
          | { kind: 'create'; data: CreateAdminUserInput }
          | { kind: 'update'; userId: string; data: UpdateAdminUserInput },
      ) =>
        input.kind === 'create'
          ? repository.createUser(input.data)
          : repository.updateUser(input.userId, input.data),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.users }),
    })
  }

  function useDeleteAdminUser() {
    const queryClient = useQueryClient()
    return useMutation({
      mutationKey: adminKeys.all,
      mutationFn: (userId: string) => repository.deleteUser(userId),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.users }),
    })
  }

  function useAdminOrders(filters: SalesFilters, page: number) {
    return useQuery({
      queryKey: [...adminKeys.orders, filters, page],
      queryFn: ({ signal }) =>
        repository.listOrders(filters, { page, pageSize: PAGE_SIZE }, signal),
      placeholderData: keepPreviousData,
      retry: false,
      staleTime: 0,
    })
  }

  function useOrderAction() {
    const queryClient = useQueryClient()
    return useMutation({
      mutationKey: adminKeys.all,
      mutationFn: (input: { orderId: string; action: OrderAction; reason: string }) =>
        repository.runOrderAction(input.orderId, input.action, input.reason),
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: adminKeys.orders })
        void queryClient.invalidateQueries({ queryKey: adminKeys.customers })
        void queryClient.invalidateQueries({ queryKey: adminKeys.dashboard })
      },
    })
  }

  function useExportOrders() {
    return useMutation({
      mutationKey: adminKeys.all,
      mutationFn: (filters: SalesFilters) => repository.exportOrders(filters),
      onSuccess: saveDownloadedFile,
    })
  }

  function useAdminCustomers(filters: CustomerFilters, page: number) {
    return useQuery({
      queryKey: [...adminKeys.customers, filters, page],
      queryFn: ({ signal }) =>
        repository.listCustomers(filters, { page, pageSize: PAGE_SIZE }, signal),
      placeholderData: keepPreviousData,
      retry: false,
      staleTime: 0,
    })
  }

  function useExportCustomers() {
    return useMutation({
      mutationKey: adminKeys.all,
      mutationFn: (filters: CustomerFilters) => repository.exportCustomers(filters),
      onSuccess: saveDownloadedFile,
    })
  }

  function useAdminDashboard() {
    return useQuery({
      queryKey: adminKeys.dashboard,
      queryFn: ({ signal }) => repository.getDashboard(signal),
      retry: false,
      staleTime: 0,
      refetchInterval: 60_000,
    })
  }

  function useAdminRaffles() {
    return useQuery({
      queryKey: adminKeys.raffles,
      queryFn: ({ signal }) => repository.listRaffles(signal),
      retry: false,
      staleTime: 0,
    })
  }

  function useSaveRaffle() {
    const queryClient = useQueryClient()
    return useMutation({
      mutationKey: adminKeys.all,
      mutationFn: (input: { source: ContestSource; values: ContestValues }) =>
        repository.updateRaffle(input.source, input.values),
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: adminKeys.raffles })
        void queryClient.invalidateQueries({ queryKey: adminKeys.dashboard })
        // A Home pública usa outra chave; força nova leitura dos concursos.
        void queryClient.invalidateQueries({ queryKey: ['active-raffle'] })
      },
    })
  }

  function useAdminSettings() {
    return useQuery({
      queryKey: adminKeys.settings,
      queryFn: ({ signal }) => repository.getSettings(signal),
      retry: false,
      staleTime: 0,
    })
  }

  function useSaveSettings() {
    const queryClient = useQueryClient()
    return useMutation({
      mutationKey: adminKeys.all,
      mutationFn: (youtubeUrl: string) => repository.updateSettings(youtubeUrl),
      onSuccess: (settings) => {
        queryClient.setQueryData(adminKeys.settings, settings)
        void queryClient.invalidateQueries({ queryKey: ['site-settings'] })
      },
    })
  }

  return {
    useAdminRaffles,
    useSaveRaffle,
    useAdminSettings,
    useSaveSettings,
    useAdminDashboard,
    useAdminOrders,
    useOrderAction,
    useExportOrders,
    useAdminCustomers,
    useExportCustomers,
    useAdminSession,
    useAdminLogin,
    useAdminLogout,
    useAdminUsers,
    useSaveAdminUser,
    useDeleteAdminUser,
  }
}

export const {
  useAdminRaffles,
  useSaveRaffle,
  useAdminSettings,
  useSaveSettings,
  useAdminDashboard,
  useAdminOrders,
  useOrderAction,
  useExportOrders,
  useAdminCustomers,
  useExportCustomers,
  useAdminSession,
  useAdminLogin,
  useAdminLogout,
  useAdminUsers,
  useSaveAdminUser,
  useDeleteAdminUser,
} = createAdminHooks(adminRepository)
