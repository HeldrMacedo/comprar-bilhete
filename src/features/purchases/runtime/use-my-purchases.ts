import { useQuery } from '@tanstack/react-query'
import type { PurchaseRepository } from '../domain/types'
import { purchaseRepository } from '../repository/purchase-repository'

export function createUseMyPurchases(repository: PurchaseRepository) {
  return function useMyPurchases() {
    return useQuery({
      queryKey: ['purchases', 'mine'],
      queryFn: ({ signal }) => repository.listMine(signal),
      retry: false,
      staleTime: 0,
    })
  }
}

export const useMyPurchases = createUseMyPurchases(purchaseRepository)
