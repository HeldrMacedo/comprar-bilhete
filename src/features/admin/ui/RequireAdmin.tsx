import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ErrorState } from '../../../shared/ui/ErrorState'
import { Spinner } from '../../../shared/ui/Spinner'
import { useAdminSession } from '../runtime/admin-queries'

export function RequireAdmin({ children }: { children: ReactNode }) {
  const location = useLocation()
  const session = useAdminSession()

  if (session.isPending) {
    return (
      <div className="admin-center">
        <Spinner label="Verificando acesso" />
      </div>
    )
  }
  if (session.isError) {
    return (
      <div className="admin-center">
        <ErrorState message={session.error.message} onRetry={() => void session.refetch()} />
      </div>
    )
  }
  if (!session.data) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/admin/login?next=${encodeURIComponent(next)}`} replace />
  }
  return children
}
