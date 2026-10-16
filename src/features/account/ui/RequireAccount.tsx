import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ErrorState } from '../../../shared/ui/ErrorState'
import { Spinner } from '../../../shared/ui/Spinner'
import { useAccount } from '../runtime/account-queries'

export function RequireAccount({ children }: { children: ReactNode }) {
  const location = useLocation()
  const account = useAccount()

  if (account.isPending) {
    return (
      <section className="container page-section">
        <Spinner label="Verificando sua conta" />
      </section>
    )
  }
  if (account.isError) {
    return (
      <section className="container page-section">
        <ErrorState message={account.error.message} onRetry={() => void account.refetch()} />
      </section>
    )
  }
  if (!account.data) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/entrar?next=${encodeURIComponent(next)}`} replace />
  }
  return children
}
