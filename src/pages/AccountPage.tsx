import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Account } from '../features/account/domain/types'
import { useAccount, useUpdateProfile } from '../features/account/runtime/account-queries'
import {
  profileFormSchema,
  type ProfileForm,
  type ProfileFormOutput,
} from '../features/account/service/account-forms'
import { safeAccountRedirect } from '../features/account/service/account-redirect'
import { AddressFields, TextField } from '../features/account/ui/AddressFields'
import { formatCpf, formatPhone, onlyDigits } from '../shared/lib/forms'
import { Spinner } from '../shared/ui/Spinner'

// Fica dentro de RequireAccount: a conta já está carregada quando a página aparece.
export function AccountPage() {
  const account = useAccount()

  return (
    <section className="container page-section account-page">
      <div className="page-title">
        <div>
          <h1>Meus dados</h1>
          <p>Mantenha endereço e contato em dia para comprar e receber prêmios.</p>
        </div>
      </div>
      {account.data ? <ProfileFormSection account={account.data} /> : null}
    </section>
  )
}

function ProfileFormSection({ account }: { account: Account }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const updateProfile = useUpdateProfile()
  const [saved, setSaved] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitted, isSubmitting },
  } = useForm<ProfileForm, unknown, ProfileFormOutput>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: account.name,
      phone: formatPhone(account.phone),
      email: account.email ?? '',
      address: {
        zipCode: account.address?.zipCode ?? '',
        street: account.address?.street ?? '',
        number: account.address?.number ?? '',
        complement: account.address?.complement ?? '',
        neighborhood: account.address?.neighborhood ?? '',
        city: account.address?.city ?? '',
        state: account.address?.state ?? '',
      },
      currentPassword: '',
    },
  })

  async function onSubmit({ currentPassword, ...profile }: ProfileFormOutput) {
    setSaved(false)
    setSubmitError(null)
    try {
      await updateProfile.mutateAsync({
        customer: { ...profile, phone: onlyDigits(profile.phone) },
        currentPassword,
      })
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Não foi possível salvar seus dados.')
      return
    }
    setValue('currentPassword', '')
    setSaved(true)
    const next = searchParams.get('next')
    if (next && safeAccountRedirect(next) === next) navigate(next, { replace: true })
  }

  return (
    <form className="surface form-surface" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="form-row">
        <TextField
          id="account-name"
          label="Nome completo"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField id="account-cpf" label="CPF" readOnly value={formatCpf(account.cpf)} />
      </div>
      <div className="form-row">
        <TextField
          id="account-phone"
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
          id="account-email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
      </div>
      <AddressFields fieldProps={(name) => register(name)} errors={errors.address} />
      <TextField
        id="account-current-password"
        label="Senha atual"
        type="password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      {submitError ? (
        <div className="inline-error" role="alert">
          {submitError}
        </div>
      ) : null}
      <p className="form-success" role="status">
        {saved ? 'Dados atualizados.' : null}
      </p>
      <button className="button button--primary button--full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Spinner label="Salvando..." /> : 'Salvar dados'}
      </button>
    </form>
  )
}
