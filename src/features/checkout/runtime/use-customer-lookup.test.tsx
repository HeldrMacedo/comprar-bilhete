import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  CustomerLookupResult,
  CustomerRepository,
  ExternalCustomer,
  LookupCriteria,
} from '../domain/types'
import { createQueryWrapper } from '../../../test/render-with-query'
import { createUseCustomerLookup } from './use-customer-lookup'

const maria: ExternalCustomer = {
  externalId: '2015',
  name: 'Maria da Silva',
  cpf: '52998224725',
  phone: '84999855367',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

function renderLookup(initialProps: LookupCriteria, repository: CustomerRepository) {
  const useLookup = createUseCustomerLookup(repository)
  return renderHook(({ criteria }) => useLookup(criteria), {
    initialProps: { criteria: initialProps },
    wrapper: createQueryWrapper(),
  })
}

describe('useCustomerLookup', () => {
  it('keeps newest lookup when an older request resolves late', async () => {
    const first = deferred<CustomerLookupResult>()
    const second = deferred<CustomerLookupResult>()
    const lookup = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const repository: CustomerRepository = { lookup }
    const rendered = renderLookup({ cpf: '52998224725', phone: '' }, repository)
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1), { timeout: 1_000 })

    rendered.rerender({ criteria: { cpf: '', phone: '84999855367' } })
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2), { timeout: 1_000 })
    second.resolve({ found: true, customer: maria })
    await waitFor(() => expect(rendered.result.current.data).toMatchObject({ customer: maria }))
    first.resolve({ found: false })
    expect(rendered.result.current.data).toMatchObject({ customer: maria })
  })

  it('does not query incomplete identifiers', async () => {
    const lookup = vi.fn()
    renderLookup({ cpf: '529', phone: '' }, { lookup })
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(lookup).not.toHaveBeenCalled()
  })
})
