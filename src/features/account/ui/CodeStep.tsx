import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Spinner } from '../../../shared/ui/Spinner'
import { codeField, newPasswordFormSchema, type NewPasswordForm } from '../service/account-forms'
import { TextField } from './AddressFields'

// O backend só aceita novo envio 60 s depois do anterior.
const RESEND_SECONDS = 60

// Sem nova senha (cadastro): os campos de senha existem no formulário, mas não são exibidos.
const codeOnlySchema = z.object({
  code: codeField,
  password: z.string(),
  confirmPassword: z.string(),
})

export function CodeStep({
  withNewPassword = false,
  submitLabel,
  busy,
  onSubmit,
  onResend,
}: {
  withNewPassword?: boolean
  submitLabel: string
  busy: boolean
  onSubmit: (values: { code: string; password: string }) => Promise<void>
  /** Devolve `true` quando o novo código foi enviado, reiniciando a contagem. */
  onResend: () => Promise<boolean>
}) {
  const [remaining, setRemaining] = useState(RESEND_SECONDS)
  const counting = remaining > 0
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewPasswordForm>({
    resolver: zodResolver(withNewPassword ? newPasswordFormSchema : codeOnlySchema),
    defaultValues: { code: '', password: '', confirmPassword: '' },
  })

  useEffect(() => {
    if (!counting) return
    const timer = window.setInterval(
      () => setRemaining((seconds) => Math.max(0, seconds - 1)),
      1_000,
    )
    return () => window.clearInterval(timer)
  }, [counting])

  async function resend() {
    if (await onResend()) setRemaining(RESEND_SECONDS)
  }

  return (
    <form
      className="auth-flow__form"
      onSubmit={handleSubmit(({ code, password }) => onSubmit({ code, password }))}
      noValidate
    >
      <TextField
        id="auth-code"
        label="Código"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        error={errors.code?.message}
        {...register('code')}
      />
      {withNewPassword ? (
        <div className="form-row">
          <TextField
            id="auth-new-password"
            label="Nova senha"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <TextField
            id="auth-confirm-password"
            label="Confirmar senha"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
        </div>
      ) : null}
      <button className="button button--primary button--full" type="submit" disabled={busy}>
        {busy ? <Spinner label="Aguarde..." /> : submitLabel}
      </button>
      <div className="code-step__resend">
        <button
          type="button"
          className="text-button"
          onClick={() => void resend()}
          disabled={counting || busy}
          aria-describedby="auth-resend-timer"
        >
          Reenviar código
        </button>
        <small id="auth-resend-timer">
          {counting
            ? `Você pode pedir outro código em ${remaining} s.`
            : 'Não recebeu? Peça outro.'}
        </small>
      </div>
    </form>
  )
}
