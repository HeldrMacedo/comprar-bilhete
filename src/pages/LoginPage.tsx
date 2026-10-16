import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAccount } from '../features/account/runtime/account-queries'
import { safeAccountRedirect } from '../features/account/service/account-redirect'
import { AuthFlow } from '../features/account/ui/AuthFlow'
import { Spinner } from '../shared/ui/Spinner'

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const account = useAccount()
  const next = safeAccountRedirect(searchParams.get('next'))

  if (account.data) return <Navigate to={next} replace />

  return (
    <section className="container page-section account-page">
      <div className="page-title">
        <div>
          <h1>Entrar</h1>
          <p>Use seu CPF para entrar ou criar sua conta.</p>
        </div>
      </div>
      <div className="surface form-surface">
        {account.isPending ? (
          <Spinner label="Verificando sua conta" />
        ) : (
          <AuthFlow onAuthenticated={() => navigate(next, { replace: true })} />
        )}
      </div>
    </section>
  )
}
