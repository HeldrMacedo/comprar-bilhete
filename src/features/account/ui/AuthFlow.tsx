import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { ApiError } from '../../../shared/api/http-client'
import { formatCpf, formatPhone, onlyDigits } from '../../../shared/lib/forms'
import { Spinner } from '../../../shared/ui/Spinner'
import type { Account } from '../domain/types'
import {
  cpfFormSchema,
  noEmailFormSchema,
  passwordFormSchema,
  signupFormSchema,
  toProfile,
  type NoEmailForm,
  type NoEmailFormOutput,
  type SignupForm,
  type SignupFormOutput,
} from '../service/account-forms'
import {
  useIdentify,
  useLogin,
  useRegister,
  useRequestCode,
  useSetPassword,
} from '../runtime/account-queries'
import { AddressFields, TextField } from './AddressFields'
import { CodeStep } from './CodeStep'

type Step =
  | { name: 'cpf'; cpf?: string }
  | { name: 'password'; cpf: string }
  | { name: 'first-access'; cpf: string; maskedEmail: string }
  | { name: 'no-email'; cpf: string }
  | { name: 'signup'; cpf: string }
  | { name: 'code'; cpf: string; purpose: 'first_access' | 'reset' }
  | { name: 'signup-code'; cpf: string; signup: SignupFormOutput }

function stepTitle(step: Step, title: string) {
  switch (step.name) {
    case 'cpf':
      return title
    case 'password':
      return 'Digite sua senha'
    case 'first-access':
      return 'Primeiro acesso'
    case 'no-email':
      return 'Cadastro sem e-mail'
    case 'signup':
      return 'Crie sua conta'
    case 'code':
      return step.purpose === 'reset' ? 'Recupere sua senha' : 'Crie sua senha'
    case 'signup-code':
      return 'Confirme seu e-mail'
  }
}

// CPF primeiro; o backend diz se é login, primeiro acesso, cadastro sem e-mail ou cadastro novo.
export function AuthFlow({
  onAuthenticated,
  title = 'Entre ou cadastre-se',
}: {
  onAuthenticated: (account: Account) => void
  title?: string
}) {
  const [step, setStep] = useState<Step>({ name: 'cpf' })
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusHeading = useRef(false)
  const identify = useIdentify()
  const requestCode = useRequestCode()
  const login = useLogin()
  const registerAccount = useRegister()
  const setPassword = useSetPassword()
  const busy =
    identify.isPending ||
    requestCode.isPending ||
    login.isPending ||
    registerAccount.isPending ||
    setPassword.isPending

  // Só move o foco em troca de etapa, nunca ao montar (o checkout não deve rolar sozinho).
  useEffect(() => {
    if (!focusHeading.current) return
    focusHeading.current = false
    headingRef.current?.focus()
  }, [step])

  function goTo(next: Step, message: string | null = null) {
    focusHeading.current = true
    setError(message)
    setStep(next)
  }

  async function attempt(action: () => Promise<void>) {
    setError(null)
    try {
      await action()
      return true
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'ACCOUNT_EXISTS') {
        // CPF que já tem conta: volta ao início com o CPF preenchido para entrar com a senha.
        goTo({ name: 'cpf', cpf: step.cpf }, cause.message)
      } else {
        setError(
          cause instanceof Error ? cause.message : 'Não foi possível continuar. Tente novamente.',
        )
      }
      return false
    }
  }

  function identifyCpf(cpf: string) {
    return attempt(async () => {
      const result = await identify.mutateAsync(cpf)
      if (result.status === 'account') goTo({ name: 'password', cpf })
      else if (result.status === 'first_access')
        goTo({ name: 'first-access', cpf, maskedEmail: result.maskedEmail })
      else if (result.status === 'no_email') goTo({ name: 'no-email', cpf })
      else goTo({ name: 'signup', cpf })
    })
  }

  function sendCode(cpf: string, purpose: 'first_access' | 'reset') {
    return attempt(async () => {
      await requestCode.mutateAsync({ purpose, cpf })
      goTo({ name: 'code', cpf, purpose })
    })
  }

  function authenticate(request: () => Promise<Account>) {
    return attempt(async () => onAuthenticated(await request()))
  }

  const cpf = step.name === 'cpf' ? undefined : step.cpf

  return (
    <div className="auth-flow">
      <h2 className="auth-flow__title" ref={headingRef} tabIndex={-1}>
        {stepTitle(step, title)}
      </h2>
      {cpf ? (
        <p className="auth-flow__cpf">
          <span>CPF {formatCpf(cpf)}</span>
          <button
            type="button"
            className="text-button"
            onClick={() => goTo({ name: 'cpf' })}
            disabled={busy}
          >
            Trocar CPF
          </button>
        </p>
      ) : null}

      {step.name === 'cpf' ? (
        <CpfStep defaultCpf={step.cpf} busy={busy} onSubmit={(value) => void identifyCpf(value)} />
      ) : null}

      {step.name === 'password' ? (
        <PasswordStep
          busy={busy}
          onSubmit={(password) =>
            void authenticate(() => login.mutateAsync({ cpf: step.cpf, password }))
          }
          onForgot={() => void sendCode(step.cpf, 'reset')}
        />
      ) : null}

      {step.name === 'first-access' ? (
        <>
          <p>Encontramos seu cadastro. Enviaremos um código para {step.maskedEmail}.</p>
          <button
            className="button button--primary button--full"
            type="button"
            disabled={busy}
            onClick={() => void sendCode(step.cpf, 'first_access')}
          >
            {busy ? <Spinner label="Enviando..." /> : 'Enviar código'}
          </button>
        </>
      ) : null}

      {step.name === 'no-email' ? (
        <NoEmailStep
          busy={busy}
          onSubmit={({ code, email, password }) =>
            void authenticate(() =>
              setPassword.mutateAsync({ cpf: step.cpf, code, password, email }),
            )
          }
        />
      ) : null}

      {step.name === 'signup' ? (
        <SignupStep
          cpf={step.cpf}
          busy={busy}
          onSubmit={(signup) =>
            void attempt(async () => {
              await requestCode.mutateAsync({
                purpose: 'signup',
                cpf: step.cpf,
                email: signup.email,
              })
              goTo({ name: 'signup-code', cpf: step.cpf, signup })
            })
          }
        />
      ) : null}

      {step.name === 'code' ? (
        <>
          <p>
            Enviamos um código de 6 dígitos para o e-mail do seu cadastro. Ele vale por 15 minutos.
          </p>
          <CodeStep
            withNewPassword
            submitLabel="Criar senha e entrar"
            busy={busy}
            onSubmit={async ({ code, password }) => {
              await authenticate(() => setPassword.mutateAsync({ cpf: step.cpf, code, password }))
            }}
            onResend={() =>
              attempt(() => requestCode.mutateAsync({ purpose: step.purpose, cpf: step.cpf }))
            }
          />
        </>
      ) : null}

      {step.name === 'signup-code' ? (
        <>
          <p>Enviamos um código de 6 dígitos para {step.signup.email}. Ele vale por 15 minutos.</p>
          <CodeStep
            submitLabel="Confirmar e entrar"
            busy={busy}
            onSubmit={async ({ code }) => {
              await authenticate(() =>
                registerAccount.mutateAsync({
                  customer: toProfile(step.signup),
                  password: step.signup.password,
                  code,
                }),
              )
            }}
            onResend={() =>
              attempt(() =>
                requestCode.mutateAsync({
                  purpose: 'signup',
                  cpf: step.cpf,
                  email: step.signup.email,
                }),
              )
            }
          />
        </>
      ) : null}

      {error ? (
        <div className="inline-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  )
}

function SubmitButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button className="button button--primary button--full" type="submit" disabled={busy}>
      {busy ? <Spinner label="Aguarde..." /> : label}
    </button>
  )
}

function CpfStep({
  defaultCpf,
  busy,
  onSubmit,
}: {
  defaultCpf?: string
  busy: boolean
  onSubmit: (cpf: string) => void
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitted },
  } = useForm<{ cpf: string }>({
    resolver: zodResolver(cpfFormSchema),
    defaultValues: { cpf: defaultCpf ? formatCpf(defaultCpf) : '' },
  })
  return (
    <form
      className="auth-flow__form"
      onSubmit={handleSubmit(({ cpf }) => onSubmit(onlyDigits(cpf)))}
      noValidate
    >
      <TextField
        id="auth-cpf"
        label="CPF"
        inputMode="numeric"
        autoComplete="username"
        error={errors.cpf?.message}
        {...register('cpf')}
        onChange={(event) =>
          setValue('cpf', formatCpf(event.target.value), { shouldValidate: isSubmitted })
        }
      />
      <SubmitButton busy={busy} label="Continuar" />
    </form>
  )
}

function PasswordStep({
  busy,
  onSubmit,
  onForgot,
}: {
  busy: boolean
  onSubmit: (password: string) => void
  onForgot: () => void
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ password: string }>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { password: '' },
  })
  return (
    <form
      className="auth-flow__form"
      onSubmit={handleSubmit(({ password }) => onSubmit(password))}
      noValidate
    >
      <TextField
        id="auth-password"
        label="Senha"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <SubmitButton busy={busy} label="Entrar" />
      <button type="button" className="text-button" onClick={onForgot} disabled={busy}>
        Esqueci minha senha
      </button>
    </form>
  )
}

function NoEmailStep({
  busy,
  onSubmit,
}: {
  busy: boolean
  onSubmit: (values: NoEmailFormOutput) => void
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NoEmailForm, unknown, NoEmailFormOutput>({
    resolver: zodResolver(noEmailFormSchema),
    defaultValues: { code: '', email: '', password: '', confirmPassword: '' },
  })
  return (
    <form className="auth-flow__form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <p>
        Seu cadastro não tem e-mail. Procure a lotérica ou o suporte para incluir, ou informe o
        código que recebeu do atendimento.
      </p>
      <TextField
        id="auth-code"
        label="Código"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        error={errors.code?.message}
        {...register('code')}
      />
      <TextField
        id="auth-email"
        label="E-mail"
        type="email"
        inputMode="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <div className="form-row">
        <TextField
          id="auth-new-password"
          label="Senha"
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
      <SubmitButton busy={busy} label="Criar senha e entrar" />
    </form>
  )
}

function SignupStep({
  cpf,
  busy,
  onSubmit,
}: {
  cpf: string
  busy: boolean
  onSubmit: (values: SignupFormOutput) => void
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitted },
  } = useForm<SignupForm, unknown, SignupFormOutput>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      name: '',
      cpf: formatCpf(cpf),
      phone: '',
      email: '',
      address: {
        zipCode: '',
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: '',
      },
      password: '',
      confirmPassword: '',
    },
  })
  return (
    <form className="auth-flow__form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <p>Não encontramos cadastro para este CPF. Preencha seus dados para criar sua conta.</p>
      <div className="form-row">
        <TextField
          id="auth-name"
          label="Nome completo"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          id="auth-signup-cpf"
          label="CPF"
          readOnly
          error={errors.cpf?.message}
          {...register('cpf')}
        />
      </div>
      <div className="form-row">
        <TextField
          id="auth-phone"
          label="Celular com DDD"
          type="tel"
          autoComplete="tel-national"
          error={errors.phone?.message}
          {...register('phone')}
          onChange={(event) =>
            setValue('phone', formatPhone(event.target.value), { shouldValidate: isSubmitted })
          }
        />
        <TextField
          id="auth-email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
      </div>
      <AddressFields fieldProps={(name) => register(name)} errors={errors.address} />
      <div className="form-row">
        <TextField
          id="auth-new-password"
          label="Senha"
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
      <SubmitButton busy={busy} label="Enviar código" />
    </form>
  )
}
