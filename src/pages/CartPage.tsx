import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../features/cart/runtime/cart-context'
import { isReservationConflict, startCheckout } from '../features/checkout/service/checkout-service'
import {
  createCustomerSchema,
  type CustomerForm,
} from '../features/checkout/service/customer-schema'
import { useCustomerLookup } from '../features/checkout/runtime/use-customer-lookup'
import { formatCurrency } from '../shared/lib/currency'
import { formatCpf, formatPhone, onlyDigits } from '../shared/lib/forms'
import { Spinner } from '../shared/ui/Spinner'

export function CartPage() {
  const { cart, itemCount, totalInCents, removeCard, clearCart } = useCart()
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CustomerForm>({
    resolver: zodResolver(createCustomerSchema(false)),
    defaultValues: { name: '', cpf: '', phone: '' },
  })
  const cpf = watch('cpf')
  const phone = watch('phone')
  const lookup = useCustomerLookup({ cpf, phone })
  const addressRequired = lookup.data?.found === false

  useEffect(() => {
    if (!lookup.data?.found) return
    const customer = lookup.data.customer
    if (customer.name) setValue('name', customer.name, { shouldValidate: true })
    if (customer.cpf) setValue('cpf', formatCpf(customer.cpf), { shouldValidate: true })
    if (customer.phone) setValue('phone', formatPhone(customer.phone), { shouldValidate: true })
    if (customer.address) {
      setValue('address.zipCode', customer.address.zipCode)
      setValue('address.street', customer.address.street)
      setValue('address.number', customer.address.number)
      setValue('address.complement', customer.address.complement)
      setValue('address.neighborhood', customer.address.neighborhood)
      setValue('address.city', customer.address.city)
      setValue('address.state', customer.address.state)
    }
  }, [lookup.data, setValue])

  if (!cart) {
    return (
      <section className="container empty-cart page-section">
        <div className="empty-cart__icon" aria-hidden="true">
          01
        </div>
        <h1>Seu carrinho esta vazio</h1>
        <p>Escolha uma ou mais cartelas para continuar.</p>
        <Link className="button button--primary" to="/">
          Escolher cartelas
        </Link>
      </section>
    )
  }

  async function onSubmit(customer: CustomerForm) {
    if (!cart) return
    const identifier = onlyDigits(cpf ?? '')
    const phoneIdentifier = onlyDigits(phone ?? '')
    if (!lookup.data && (identifier.length === 11 || [10, 11].includes(phoneIdentifier.length))) {
      setSubmitError('Aguarde a consulta do cadastro antes de continuar.')
      return
    }
    const parsed = createCustomerSchema(addressRequired).safeParse(customer)
    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? 'Revise os dados informados.')
      return
    }
    const currentCart = cart
    setSubmitError(null)
    try {
      const { checkout } = await startCheckout(currentCart, customer)
      window.location.assign(checkout.checkoutUrl)
    } catch (error) {
      if (isReservationConflict(error)) {
        clearCart()
        navigate('/', { state: { notice: 'As cartelas selecionadas não estão mais disponíveis.' } })
        return
      }
      setSubmitError(
        error instanceof Error ? error.message : 'Nao foi possivel iniciar o pagamento.',
      )
    }
  }

  const cards = cart.selection.mode === 'manual' ? cart.selection.cards : []

  return (
    <section className="container page-section checkout-page">
      <Link className="back-link" to="/">
        <ArrowLeft size={17} /> Voltar para as cartelas
      </Link>
      <div className="page-title">
        <span>02</span>
        <div>
          <h1>Revise e finalize</h1>
          <p>Confira suas cartelas e informe quem esta participando.</p>
        </div>
      </div>

      <div className="checkout-grid">
        <div className="checkout-main">
          <section className="surface">
            <div className="surface__header">
              <div>
                <span className="surface__label">Suas cartelas</span>
                <h2>{cart.raffleTitle}</h2>
              </div>
              <strong>
                {itemCount} {itemCount === 1 ? 'unidade' : 'unidades'}
              </strong>
            </div>
            {cart.selection.mode === 'random' ? (
              <p className="random-summary">
                {cart.selection.quantity} cartelas serao escolhidas pelo servidor.
              </p>
            ) : (
              <div className="cart-items">
                {cards.map((card) => (
                  <article className="cart-item" key={card.id}>
                    <div>
                      <strong>Cartela {card.code}</strong>
                      <div className="number-list">
                        {card.numbers.map((number, index) => (
                          <span key={`${card.id}-${index}`}>{String(number).padStart(2, '0')}</span>
                        ))}
                      </div>
                    </div>
                    <div className="cart-item__actions">
                      <strong>{formatCurrency(cart.priceInCents)}</strong>
                      <button
                        type="button"
                        onClick={() => removeCard(card.id)}
                        aria-label={`Remover cartela ${card.code}`}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <form
            id="customer-form"
            className="surface form-surface"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            <div className="surface__header">
              <div>
                <span className="surface__label">Dados do participante</span>
                <h2>Quem vai concorrer?</h2>
              </div>
            </div>
            <div className="field">
              <label htmlFor="name">Nome completo</label>
              <input
                id="name"
                autoComplete="name"
                {...register('name')}
                aria-invalid={!!errors.name}
              />
              {errors.name ? <small role="alert">{errors.name.message}</small> : null}
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="cpf">CPF</label>
                <input
                  id="cpf"
                  inputMode="numeric"
                  {...register('cpf')}
                  onChange={(event) =>
                    setValue('cpf', formatCpf(event.target.value), { shouldValidate: true })
                  }
                  aria-invalid={!!errors.cpf}
                />
                {errors.cpf ? <small role="alert">{errors.cpf.message}</small> : null}
              </div>
              <div className="field">
                <label htmlFor="phone">Celular com DDD</label>
                <input
                  id="phone"
                  type="tel"
                  {...register('phone')}
                  onChange={(event) =>
                    setValue('phone', formatPhone(event.target.value), { shouldValidate: true })
                  }
                  aria-invalid={!!errors.phone}
                />
                {errors.phone ? <small role="alert">{errors.phone.message}</small> : null}
              </div>
            </div>
            <div aria-live="polite" className="lookup-status">
              {lookup.isFetching
                ? 'Buscando cadastro...'
                : lookup.isError
                  ? 'Nao foi possivel consultar. Tente novamente.'
                  : lookup.data?.found
                    ? 'Cliente encontrado'
                    : addressRequired
                      ? 'Complete seu endereco'
                      : null}
              {lookup.isError ? (
                <button type="button" onClick={() => void lookup.refetch()}>
                  Tentar novamente
                </button>
              ) : null}
            </div>
            {addressRequired ? <AddressFields register={register} errors={errors} /> : null}
            <p className="privacy-note">
              <LockKeyhole size={16} /> Seus dados sao usados apenas para identificar a compra e o
              ganhador.
            </p>
            {submitError ? (
              <div className="inline-error" role="alert">
                {submitError}
              </div>
            ) : null}
          </form>
        </div>

        <aside className="order-summary surface">
          <span className="surface__label">Resumo da compra</span>
          <div className="summary-line">
            <span>{itemCount} cartela(s)</span>
            <span>{formatCurrency(totalInCents)}</span>
          </div>
          <div className="summary-line">
            <span>Taxa Pix</span>
            <strong>Gratis</strong>
          </div>
          <div className="summary-total">
            <span>Total</span>
            <strong>{formatCurrency(totalInCents)}</strong>
          </div>
          <button
            className="button button--primary button--full"
            form="customer-form"
            type="submit"
            disabled={isSubmitting || lookup.isFetching || lookup.isError}
          >
            {isSubmitting ? (
              <Spinner label="Preparando..." />
            ) : (
              <>
                Continuar para o Pix <ArrowRight size={19} />
              </>
            )}
          </button>
          <div className="safe-payment">
            <ShieldCheck size={20} />
            <span>
              <strong>Pagamento seguro</strong>Voce sera direcionado a InfinitePay.
            </span>
          </div>
        </aside>
      </div>
    </section>
  )
}

function AddressFields({
  register,
  errors,
}: {
  register: UseFormRegister<CustomerForm>
  errors: FieldErrors<CustomerForm>
}) {
  return (
    <div className="address-fields">
      <h3>Complete seu endereco</h3>
      <div className="form-row">
        <Field
          label="CEP"
          id="address.zipCode"
          register={register}
          error={errors.address?.zipCode?.message}
        />
        <Field
          label="Endereco"
          id="address.street"
          register={register}
          error={errors.address?.street?.message}
        />
      </div>
      <div className="form-row">
        <Field
          label="Numero"
          id="address.number"
          register={register}
          error={errors.address?.number?.message}
        />
        <Field
          label="Complemento"
          id="address.complement"
          register={register}
          error={errors.address?.complement?.message}
          required={false}
        />
      </div>
      <div className="form-row">
        <Field
          label="Bairro"
          id="address.neighborhood"
          register={register}
          error={errors.address?.neighborhood?.message}
        />
        <Field
          label="Cidade"
          id="address.city"
          register={register}
          error={errors.address?.city?.message}
        />
      </div>
      <Field
        label="UF"
        id="address.state"
        register={register}
        error={errors.address?.state?.message}
      />
    </div>
  )
}

type AddressField =
  | 'address.zipCode'
  | 'address.street'
  | 'address.number'
  | 'address.complement'
  | 'address.neighborhood'
  | 'address.city'
  | 'address.state'

function Field({
  label,
  id,
  register,
  error,
  required = true,
}: {
  label: string
  id: AddressField
  register: UseFormRegister<CustomerForm>
  error?: string
  required?: boolean
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        required={required}
        maxLength={id === 'address.state' ? 2 : undefined}
        {...register(id)}
        aria-invalid={!!error}
      />
      {error ? <small role="alert">{error}</small> : null}
    </div>
  )
}
