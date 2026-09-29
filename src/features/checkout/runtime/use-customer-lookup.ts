import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { onlyDigits } from '../../../shared/lib/forms'
import type { CustomerRepository, LookupCriteria } from '../domain/types'
import { customerRepository } from '../repository/customer-repository'

export function createUseCustomerLookup(repository: CustomerRepository) {
  return function useCustomerLookup(criteria: LookupCriteria) {
    const { cpf } = criteria
    const normalized = useMemo(() => normalizeCriteria({ cpf }), [cpf])
    const [debounced, setDebounced] = useState<LookupCriteria | null>(null)

    useEffect(() => {
      setDebounced(null)
      if (!normalized) return
      const timeout = window.setTimeout(() => setDebounced(normalized), 400)
      return () => window.clearTimeout(timeout)
    }, [normalized])

    return useQuery({
      queryKey: ['customer-lookup', debounced],
      queryFn: ({ signal }) => repository.lookup(debounced!, signal),
      enabled: debounced !== null,
      retry: false,
    })
  }
}

export const useCustomerLookup = createUseCustomerLookup(customerRepository)

function normalizeCriteria(criteria: LookupCriteria): LookupCriteria | null {
  const cpf = onlyDigits(criteria.cpf)
  return cpf.length === 11 ? { cpf } : null
}
