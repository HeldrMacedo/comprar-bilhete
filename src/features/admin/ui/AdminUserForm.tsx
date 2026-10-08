import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { AdminUser, UpdateAdminUserInput } from '../domain/types'

const loginField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, 'Use de 3 a 40 letras minúsculas, números, ponto, hífen ou _.')
const nameField = z.string().trim().min(1, 'Informe o nome.').max(80)
const passwordField = z
  .string()
  .min(12, 'A senha precisa de pelo menos 12 caracteres.')
  .max(128, 'A senha pode ter no máximo 128 caracteres.')

const createSchema = z.object({ login: loginField, name: nameField, password: passwordField })
const editSchema = z.object({
  login: loginField,
  name: nameField,
  password: z.union([z.literal(''), passwordField]),
  active: z.boolean(),
})

type FormValues = { login: string; name: string; password: string; active: boolean }

type AdminUserFormProps = {
  user: AdminUser | null
  isSelf: boolean
  pending: boolean
  error: string | null
  onSubmit: (values: UpdateAdminUserInput) => void
  onCancel: () => void
}

export function AdminUserForm({
  user,
  isSelf,
  pending,
  error,
  onSubmit,
  onCancel,
}: AdminUserFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(user ? editSchema : createSchema.extend({ active: z.boolean() })),
    defaultValues: {
      login: user?.login ?? '',
      name: user?.name ?? '',
      password: '',
      active: user?.active ?? true,
    },
  })

  const submit = handleSubmit((values) => {
    if (!user) {
      onSubmit({ login: values.login, name: values.name, password: values.password })
      return
    }
    onSubmit({
      login: values.login,
      name: values.name,
      ...(values.password ? { password: values.password } : {}),
      ...(isSelf ? {} : { active: values.active }),
    })
  })

  return (
    <form className="admin-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="admin-user-name">Nome</label>
        <input
          id="admin-user-name"
          autoComplete="off"
          {...register('name')}
          aria-invalid={!!errors.name}
        />
        {errors.name ? <small role="alert">{errors.name.message}</small> : null}
      </div>
      <div className="field">
        <label htmlFor="admin-user-login">Login</label>
        <input
          id="admin-user-login"
          autoComplete="off"
          autoCapitalize="none"
          {...register('login')}
          aria-invalid={!!errors.login}
        />
        {errors.login ? <small role="alert">{errors.login.message}</small> : null}
      </div>
      <div className="field">
        <label htmlFor="admin-user-password">{user ? 'Nova senha (opcional)' : 'Senha'}</label>
        <input
          id="admin-user-password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
          aria-invalid={!!errors.password}
          aria-describedby="admin-user-password-hint"
        />
        <span id="admin-user-password-hint" className="admin-hint">
          Mínimo de 12 caracteres.{user ? ' Trocar a senha encerra as outras sessões.' : ''}
        </span>
        {errors.password ? <small role="alert">{errors.password.message}</small> : null}
      </div>
      {user && !isSelf ? (
        <label className="checkbox-field" htmlFor="admin-user-active">
          <input id="admin-user-active" type="checkbox" {...register('active')} />
          Usuário ativo
        </label>
      ) : null}
      {error ? (
        <p className="admin-form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="admin-form__actions">
        <button className="button button--secondary" type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button className="button button--primary" type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}
