import { Eraser, ExternalLink, ReceiptText, Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import type { Purchase } from '../features/purchases/domain/types'
import { usePurchaseLookup } from '../features/purchases/runtime/use-purchase-lookup'
import {
  describePaymentMethod,
  describeStatus,
} from '../features/purchases/service/purchase-labels'
import { ShareReceiptButton } from '../features/purchases/ui/ShareReceiptButton'
import { formatCurrency } from '../shared/lib/currency'
import { formatCpf, isValidCpf, onlyDigits } from '../shared/lib/forms'
import { ErrorState } from '../shared/ui/ErrorState'
import { Spinner } from '../shared/ui/Spinner'

function InteractiveTicketNumbers({
  cardCode,
  numbers,
  secondChanceNumbers = [],
}: {
  cardCode: string
  numbers: number[]
  secondChanceNumbers?: number[]
}) {
  const [marked, setMarked] = useState<Set<number>>(new Set())

  function toggle(num: number) {
    setMarked((prev) => {
      const next = new Set(prev)
      if (next.has(num)) next.delete(num)
      else next.add(num)
      return next
    })
  }

  function clear() {
    setMarked(new Set())
  }

  const hasGroups = secondChanceNumbers.length > 0
  const groups = hasGroups
    ? [
        { chance: '1ª chance', numbers },
        { chance: '2ª chance', numbers: secondChanceNumbers },
      ]
    : [{ chance: undefined, numbers }]

  return (
    <div className="interactive-ticket">
      <div className="interactive-ticket__actions">
        <button
          type="button"
          onClick={clear}
          className="interactive-ticket__clear"
          disabled={marked.size === 0}
        >
          <Eraser size={14} /> Limpar marcações
        </button>
      </div>
      <div
        className={`interactive-ticket__groups ${hasGroups ? 'interactive-ticket__groups--dual' : ''}`}
      >
        {groups.map((group) => {
          const missing = group.numbers.filter((n) => !marked.has(n)).length
          const isAlmost = missing === 1

          return (
            <div
              className={`interactive-ticket__group ${isAlmost ? 'is-almost' : ''}`}
              key={group.chance ?? 'única'}
            >
              <div className="interactive-ticket__header">
                {group.chance ? (
                  <span className="interactive-ticket__chance">{group.chance}</span>
                ) : (
                  <span />
                )}
                {isAlmost && <span className="interactive-ticket__badge">Falta apenas 1!</span>}
              </div>
              <div
                className="interactive-ticket__grid"
                aria-label={
                  group.chance
                    ? `Dezenas do bilhete ${cardCode} (${group.chance})`
                    : `Dezenas do bilhete ${cardCode}`
                }
              >
                {group.numbers.map((number, index) => {
                  const isMarked = marked.has(number)
                  return (
                    <button
                      key={index}
                      type="button"
                      aria-pressed={isMarked}
                      onClick={() => toggle(number)}
                      className={`interactive-ticket__number ${isMarked ? 'is-marked' : ''}`}
                    >
                      {String(number).padStart(2, '0')}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// O CPF chega por `history.state` (cabeçalho ou retorno do pagamento), nunca pela URL.
const locationStateSchema = z.object({ cpf: z.string().regex(/^\d{11}$/) })

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Fortaleza',
})

export function PurchasesPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const initialCpf = locationStateSchema.safeParse(location.state)
  const searchedCpf = initialCpf.success ? initialCpf.data.cpf : null
  const [cpfInput, setCpfInput] = useState(searchedCpf ? formatCpf(searchedCpf) : '')
  const [inputError, setInputError] = useState<string | null>(null)
  const lookup = usePurchaseLookup(searchedCpf)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValidCpf(cpfInput)) {
      setInputError('Informe um CPF valido.')
      return
    }
    setInputError(null)
    navigate('.', { replace: true, state: { cpf: onlyDigits(cpfInput) } })
  }

  return (
    <section className="container page-section purchases-page">
      <div className="page-title">
        <span>
          <ReceiptText size={22} aria-hidden="true" />
        </span>
        <div>
          <h1>Minhas compras</h1>
          <p>Consulte pagamento, status e dezenas dos bilhetes compradas com seu CPF.</p>
        </div>
      </div>

      <form className="surface purchases-search" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="purchase-cpf">CPF do comprador</label>
          <input
            id="purchase-cpf"
            inputMode="numeric"
            autoComplete="off"
            value={cpfInput}
            onChange={(event) => setCpfInput(formatCpf(event.target.value))}
            aria-invalid={!!inputError}
          />
          {inputError ? <small role="alert">{inputError}</small> : null}
        </div>
        <button className="button button--primary" type="submit" disabled={lookup.isFetching}>
          <Search size={18} /> Consultar
        </button>
      </form>

      {searchedCpf === null ? null : lookup.isPending ? (
        <div className="purchases-state">
          <Spinner label="Buscando suas compras..." />
        </div>
      ) : lookup.isError ? (
        <ErrorState message={lookup.error.message} onRetry={() => void lookup.refetch()} />
      ) : lookup.data.length === 0 ? (
        <div className="surface purchases-state">
          <h2>Nenhuma compra encontrada</h2>
          <p>Não há compras feitas neste site para o CPF informado.</p>
          <Link className="button button--primary" to="/">
            Escolher bilhetes
          </Link>
        </div>
      ) : (
        <div className="purchase-list">
          {lookup.data.map((purchase) => (
            <PurchaseCard key={purchase.id} purchase={purchase} />
          ))}
        </div>
      )}
    </section>
  )
}

function PurchaseCard({ purchase }: { purchase: Purchase }) {
  const status = describeStatus(purchase.status)
  const items = purchase.items ?? []
  const canShare = purchase.status === 'paid' && items.length > 0

  return (
    <article className="surface purchase-card" aria-labelledby={`purchase-${purchase.id}`}>
      <header className="purchase-card__header">
        <div>
          <span className="surface__label">Pedido</span>
          <h2 id={`purchase-${purchase.id}`}>{purchase.id.slice(0, 8).toUpperCase()}</h2>
          <small>Feito em {dateTimeFormatter.format(new Date(purchase.createdAt))}</small>
        </div>
        <span className={`status-badge status-badge--${status.tone}`}>{status.label}</span>
      </header>

      <dl className="purchase-card__facts">
        <div>
          <dt>Valor</dt>
          <dd>{formatCurrency(purchase.totalInCents)}</dd>
        </div>
        <div>
          <dt>Pagamento</dt>
          <dd>
            {purchase.paidAt ? describePaymentMethod(purchase.paymentMethod) : 'Não realizado'}
          </dd>
        </div>
        <div>
          <dt>Pago em</dt>
          <dd>{purchase.paidAt ? dateTimeFormatter.format(new Date(purchase.paidAt)) : '—'}</dd>
        </div>
        <div>
          <dt>Bilhetes</dt>
          <dd>{items.length}</dd>
        </div>
      </dl>

      {purchase.message ? <p className="purchase-card__message">{purchase.message}</p> : null}

      <ul className="purchase-card__items">
        {items.map((item) => (
          <li key={`${item.raffleId}-${item.id}`}>
            <div>
              <strong>Bilhete {item.code}</strong>
              <span>{item.raffleTitle}</span>
            </div>
            <InteractiveTicketNumbers
              cardCode={item.code}
              numbers={item.numbers}
              secondChanceNumbers={item.secondChanceNumbers}
            />
            {canShare ? (
              <ShareReceiptButton
                purchase={purchase}
                items={[item]}
                label="Compartilhar"
                ariaLabel={`Compartilhar bilhete ${item.code} no WhatsApp`}
                compact
              />
            ) : null}
          </li>
        ))}
      </ul>

      {canShare || purchase.checkoutUrl || purchase.receiptUrl ? (
        <div className="purchase-card__actions">
          {canShare ? (
            <ShareReceiptButton
              purchase={purchase}
              items={items}
              label="Compartilhar no WhatsApp"
            />
          ) : null}
          {purchase.checkoutUrl ? (
            <a className="button button--primary" href={purchase.checkoutUrl}>
              Pagar agora
            </a>
          ) : null}
          {purchase.receiptUrl ? (
            <a
              className="button button--secondary"
              href={purchase.receiptUrl}
              target="_blank"
              rel="noreferrer"
            >
              Ver comprovante <ExternalLink size={17} />
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
