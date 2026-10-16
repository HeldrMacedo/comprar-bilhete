import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import type { Account } from '../features/account/domain/types'
import {
  accountKeys,
  handleAccountUnauthenticated,
  useAccount,
} from '../features/account/runtime/account-queries'
import { AuthFlow } from '../features/account/ui/AuthFlow'
import { useCart } from '../features/cart/runtime/cart-context'
import {
  isProfileIncomplete,
  isReservationConflict,
  startCheckout,
} from '../features/checkout/service/checkout-service'
import {
  orderOptionsSchema,
  toOrderOptions,
  type OrderOptionsForm,
  type OrderOptionsFormOutput,
} from '../features/checkout/service/order-options'
import { formatCurrency } from '../shared/lib/currency'
import { formatCpf, formatPhone } from '../shared/lib/forms'
import { ErrorState } from '../shared/ui/ErrorState'
import { Spinner } from '../shared/ui/Spinner'
import { TicketNumbers } from '../shared/ui/TicketNumbers'

export function CartPage() {
  const {
    cart,
    itemCount,
    totalInCents,
    removeCard,
    decreaseRandomQuantity,
    removeEntry,
    clearCart,
  } = useCart()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const account = useAccount()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OrderOptionsForm, unknown, OrderOptionsFormOutput>({
    resolver: zodResolver(orderOptionsSchema),
    defaultValues: { email: '', buyingForThirdParty: false, beneficiaryName: '' },
  })
  const buyingForThirdParty = watch('buyingForThirdParty')
  const accountEmail = account.data?.email

  useEffect(() => {
    if (accountEmail) setValue('email', accountEmail)
  }, [accountEmail, setValue])

  if (checkoutUrl) {
    return (
      <section className="container empty-cart page-section" aria-live="polite">
        <Spinner label="Abrindo o pagamento..." />
        <p>Seus bilhetes estão reservadas. Se o pagamento não abrir, use o botão abaixo.</p>
        <a className="button button--primary" href={checkoutUrl}>
          Abrir pagamento
        </a>
      </section>
    )
  }

  if (!cart) {
    return (
      <section className="container empty-cart page-section">
        <div className="empty-cart__icon" aria-hidden="true">
          01
        </div>
        <h1>Seu carrinho esta vazio</h1>
        <p>Escolha uma ou mais bilhetes para continuar.</p>
        <Link className="button button--primary" to="/">
          Escolher bilhetes
        </Link>
      </section>
    )
  }

  async function onSubmit(options: OrderOptionsFormOutput) {
    if (!cart) return
    const currentCart = cart
    setSubmitError(null)
    try {
      const { checkout } = await startCheckout(currentCart, toOrderOptions(options))
      // O pedido já existe no backend; o carrinho não pode sobreviver para gerar outra compra.
      setCheckoutUrl(checkout.checkoutUrl)
      clearCart()
      window.location.assign(checkout.checkoutUrl)
    } catch (error) {
      if (isReservationConflict(error)) {
        clearCart()
        navigate('/', { state: { notice: 'Os bilhetes selecionadas não estão mais disponíveis.' } })
        return
      }
      // Sessão expirada: zera a conta em cache para o fluxo de entrar voltar no lugar do formulário.
      handleAccountUnauthenticated(queryClient, error, accountKeys.me)
      // Cadastro incompleto no servidor: recarrega a conta para mostrar o pedido de completar dados.
      if (isProfileIncomplete(error)) void account.refetch()
      setSubmitError(
        error instanceof Error ? error.message : 'Nao foi possivel iniciar o pagamento.',
      )
    }
  }

  return (
    <section className="container page-section checkout-page">
      <Link className="back-link" to="/">
        <ArrowLeft size={17} /> Voltar para os bilhetes
      </Link>
      <div className="page-title">
        <span>02</span>
        <div>
          <h1>Revise e finalize</h1>
          <p>Confira seus bilhetes e informe quem esta participando.</p>
        </div>
      </div>

      <div className="checkout-grid">
        <div className="checkout-main">
          <section className="surface">
            <div className="surface__header">
              <div>
                <span className="surface__label">Seus bilhetes</span>
                <h2>Sorteios selecionados</h2>
              </div>
              <div className="surface__header-actions">
                <strong>
                  {itemCount} {itemCount === 1 ? 'unidade' : 'unidades'}
                </strong>
                <button type="button" className="text-button" onClick={clearCart}>
                  <Trash2 size={15} /> Esvaziar carrinho
                </button>
              </div>
            </div>
            {cart.entries.map((entry) => (
              <div className="cart-group" key={entry.raffleId}>
                <h3>{entry.raffleTitle}</h3>
                {entry.selection.mode === 'random' ? (
                  <div className="cart-items">
                    <article className="cart-item">
                      <p className="random-summary">
                        {entry.selection.quantity} bilhete(s) serão sorteadas aleatoriamente a{' '}
                        {formatCurrency(entry.priceInCents)} cada.
                      </p>
                      <div className="cart-item__actions">
                        <div
                          className="quantity-picker quantity-picker--compact"
                          aria-label={`Quantidade de bilhetes de ${entry.raffleTitle}`}
                        >
                          <button
                            type="button"
                            onClick={() => decreaseRandomQuantity(entry.raffleId)}
                            disabled={entry.selection.quantity <= 1}
                            aria-label={`Diminuir quantidade de ${entry.raffleTitle}`}
                          >
                            −
                          </button>
                          <strong>{entry.selection.quantity}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeEntry(entry.raffleId)}
                          aria-label={`Remover bilhetes de ${entry.raffleTitle}`}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </article>
                  </div>
                ) : (
                  <div className="cart-items">
                    {entry.selection.cards.map((card) => (
                      <article className="cart-item" key={card.id}>
                        <div>
                          <strong>Bilhete {card.code}</strong>
                          <TicketNumbers
                            cardCode={card.code}
                            numbers={card.numbers}
                            secondChanceNumbers={card.secondChanceNumbers}
                          />
                        </div>
                        <div className="cart-item__actions">
                          <strong>{formatCurrency(entry.priceInCents)}</strong>
                          <button
                            type="button"
                            onClick={() => removeCard(entry.raffleId, card.id)}
                            aria-label={`Remover bilhete ${card.code} de ${entry.raffleTitle}`}
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>

          {account.isPending ? (
            <section className="surface">
              <Spinner label="Verificando sua conta" />
            </section>
          ) : account.isError ? (
            <ErrorState message={account.error.message} onRetry={() => void account.refetch()} />
          ) : !account.data ? (
            <section className="surface form-surface">
              <AuthFlow
                title="Entre ou cadastre-se para finalizar"
                onAuthenticated={() => setSubmitError(null)}
              />
            </section>
          ) : !account.data.complete ? (
            <section className="surface form-surface">
              <p>Seu cadastro está incompleto. Complete endereço e celular para comprar.</p>
              <Link className="button button--primary" to="/minha-conta?next=/carrinho">
                Completar meus dados
              </Link>
            </section>
          ) : (
            <form
              id="customer-form"
              className="surface form-surface"
              onSubmit={handleSubmit(onSubmit)}
              noValidate
            >
              <div className="surface__header">
                <div>
                  <span className="surface__label">Dados do participante</span>
                  <h2>Dados do comprador</h2>
                </div>
                <Link className="text-button" to="/minha-conta?next=/carrinho">
                  Editar
                </Link>
              </div>
              <AccountSummary account={account.data} />
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  {...register('email')}
                  aria-invalid={!!errors.email}
                />
                {errors.email ? <small role="alert">{errors.email.message}</small> : null}
              </div>
              <label className="checkbox-field" htmlFor="buyingForThirdParty">
                <input
                  id="buyingForThirdParty"
                  type="checkbox"
                  {...register('buyingForThirdParty')}
                />
                Estou comprando para outra pessoa
              </label>
              {buyingForThirdParty ? (
                <div className="field">
                  <label htmlFor="beneficiaryName">Nome de quem vai concorrer</label>
                  <input
                    id="beneficiaryName"
                    autoComplete="off"
                    {...register('beneficiaryName')}
                    aria-invalid={!!errors.beneficiaryName}
                  />
                  {errors.beneficiaryName ? (
                    <small role="alert">{errors.beneficiaryName.message}</small>
                  ) : null}
                </div>
              ) : null}
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
          )}
        </div>

        <aside className="order-summary surface">
          <span className="surface__label">Resumo da compra</span>
          <div className="summary-line">
            <span>{itemCount} bilhete(s)</span>
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
          {account.data?.complete ? (
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
          ) : null}
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

function AccountSummary({ account }: { account: Account }) {
  const address = account.address
  return (
    <dl className="account-summary">
      <div>
        <dt>Nome</dt>
        <dd>{account.name}</dd>
      </div>
      <div>
        <dt>CPF</dt>
        <dd>{formatCpf(account.cpf)}</dd>
      </div>
      <div>
        <dt>Celular</dt>
        <dd>{formatPhone(account.phone)}</dd>
      </div>
      {address ? (
        <div>
          <dt>Endereço</dt>
          <dd>
            {address.street}, {address.number}
            {address.complement ? ` - ${address.complement}` : ''} - {address.neighborhood},{' '}
            {address.city}/{address.state}
          </dd>
        </div>
      ) : null}
    </dl>
  )
}
