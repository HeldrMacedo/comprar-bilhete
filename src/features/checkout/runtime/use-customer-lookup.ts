import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { onlyDigits } from '../../../shared/lib/forms'
import type { CustomerRepository, LookupCriteria } from '../domain/types'
import { customerRepository } from '../repository/customer-repository'

type NormalizedLookup = { cpf: string } | { phone: string }

export function createUseCustomerLookup(repository: CustomerRepository) {
  return function useCustomerLookup(criteria: LookupCriteria) {
    const { cpf, phone } = criteria
    const normalized = useMemo(
      () => normalizeCriteria({ cpf, phone }),
      [cpf, phone],
    )
    const [debounced, setDebounced] = useState<NormalizedLookup | null>(null)

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

function normalizeCriteria(criteria: LookupCriteria): NormalizedLookup | null {
  const cpf = onlyDigits(criteria.cpf ?? '')
  if (cpf.length === 11) return { cpf }
  const phone = onlyDigits(criteria.phone ?? '')
  if (phone.length === 10 || phone.length === 11) return { phone }
  return null
}
