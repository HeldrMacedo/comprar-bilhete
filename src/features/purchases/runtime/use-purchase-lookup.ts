import { useQuery } from '@tanstack/react-query'
import type { PurchaseRepository } from '../domain/types'
import { purchaseRepository } from '../repository/purchase-repository'

export function createUsePurchaseLookup(repository: PurchaseRepository) {
  return function usePurchaseLookup(cpf: string | null) {
    return useQuery({
      queryKey: ['purchase-lookup', cpf],
      queryFn: ({ signal }) => repository.lookupByCpf(cpf!, signal),
      enabled: cpf !== null,
      retry: false,
      staleTime: 0,
    })
  }
}

export const usePurchaseLookup = createUsePurchaseLookup(purchaseRepository)
