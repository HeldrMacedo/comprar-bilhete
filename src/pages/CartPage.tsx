import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { useCart } from '../features/cart/runtime/cart-context'
import { startCheckout } from '../features/checkout/service/checkout-service'
import { customerSchema, type CustomerForm } from '../features/checkout/service/customer-schema'
import { formatCurrency } from '../shared/lib/currency'
import { formatCpf, formatPhone } from '../shared/lib/forms'
import { Spinner } from '../shared/ui/Spinner'

export function CartPage() {
  const { cart, totalInCents, removeCard } = useCart()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', cpf: '', phone: '' },
  })

  if (!cart) {
    return (
      <section className="container empty-cart page-section">
        <div className="empty-cart__icon" aria-hidden="true">
          01
        </div>
        <h1>Seu carrinho está vazio</h1>
        <p>Escolha uma ou mais cartelas para continuar.</p>
        <Link className="button button--primary" to="/">
          Escolher cartelas
        </Link>
      </section>
    )
  }

  async function onSubmit(customer: CustomerForm) {
    if (!cart) return
    setSubmitError(null)
    try {
      const { checkout } = await startCheckout(cart, customer)
      window.location.assign(checkout.checkoutUrl)
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Não foi possível iniciar o pagamento.',
      )
    }
  }

  return (
    <section className="container page-section checkout-page">
      <Link className="back-link" to="/">
        <ArrowLeft size={17} /> Voltar para as cartelas
      </Link>
      <div className="page-title">
        <span>02</span>
        <div>
          <h1>Revise e finalize</h1>
          <p>Confira suas cartelas e informe quem está participando.</p>
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
                {cart.cards.length} {cart.cards.length === 1 ? 'unidade' : 'unidades'}
              </strong>
            </div>
            <div className="cart-items">
              {cart.cards.map((card) => (
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
                placeholder="Digite seu nome"
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
                  autoComplete="off"
                  placeholder="000.000.000-00"
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
                  autoComplete="tel"
                  placeholder="(00) 00000-0000"
                  {...register('phone')}
                  onChange={(event) =>
                    setValue('phone', formatPhone(event.target.value), { shouldValidate: true })
                  }
                  aria-invalid={!!errors.phone}
                />
                {errors.phone ? <small role="alert">{errors.phone.message}</small> : null}
              </div>
            </div>
            <p className="privacy-note">
              <LockKeyhole size={16} /> Seus dados são usados apenas para identificar a compra e o
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
            <span>{cart.cards.length} cartela(s)</span>
            <span>{formatCurrency(totalInCents)}</span>
          </div>
          <div className="summary-line">
            <span>Taxa Pix</span>
            <strong>Grátis</strong>
          </div>
          <div className="summary-total">
            <span>Total</span>
            <strong>{formatCurrency(totalInCents)}</strong>
          </div>
          <button
            className="button button--primary button--full"
            form="customer-form"
            type="submit"
            disabled={isSubmitting}
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
              <strong>Pagamento seguro</strong>Você será direcionado à InfinitePay.
            </span>
          </div>
        </aside>
      </div>
    </section>
  )
}
