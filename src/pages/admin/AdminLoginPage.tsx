import { zodResolver } from '@hookform/resolvers/zod'
import { LockKeyhole } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { useAdminLogin, useAdminSession } from '../../features/admin/runtime/admin-queries'
import { safeAdminRedirect } from '../../features/admin/service/admin-redirect'

const loginSchema = z.object({
  login: z.string().trim().min(1, 'Informe o usuário.'),
  password: z.string().min(1, 'Informe a senha.'),
})

type LoginForm = z.infer<typeof loginSchema>

export function AdminLoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const session = useAdminSession()
  const login = useAdminLogin()
  const next = safeAdminRedirect(params.get('next'))
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  if (session.data) return <Navigate to={next} replace />

  const submit = handleSubmit((values) =>
    login.mutate(values, { onSuccess: () => navigate(next, { replace: true }) }),
  )

  return (
    <main className="admin-login">
      <form className="admin-login__card" onSubmit={submit} noValidate>
        <div className="admin-login__icon" aria-hidden="true">
          <LockKeyhole size={26} />
        </div>
        <h1>Painel administrativo</h1>
        <p>Entre com seu usuário e senha.</p>
        <div className="field">
          <label htmlFor="admin-login">Usuário</label>
          <input
            id="admin-login"
            autoComplete="username"
            autoCapitalize="none"
            {...register('login')}
            aria-invalid={!!errors.login}
          />
          {errors.login ? <small role="alert">{errors.login.message}</small> : null}
        </div>
        <div className="field">
          <label htmlFor="admin-password">Senha</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
            aria-invalid={!!errors.password}
          />
          {errors.password ? <small role="alert">{errors.password.message}</small> : null}
        </div>
        {login.isError ? (
          <p className="admin-form-error" role="alert">
            {login.error.message}
          </p>
        ) : null}
        <button className="button button--primary button--full" disabled={login.isPending}>
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
