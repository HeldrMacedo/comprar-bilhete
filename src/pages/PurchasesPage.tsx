import { ExternalLink, ReceiptText, Search } from 'lucide-react'
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
import { TicketNumbers } from '../shared/ui/TicketNumbers'

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
          <p>Consulte pagamento, status e dezenas das cartelas compradas com seu CPF.</p>
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
            Escolher cartelas
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
          <dt>Cartelas</dt>
          <dd>{items.length}</dd>
        </div>
      </dl>

      {purchase.message ? <p className="purchase-card__message">{purchase.message}</p> : null}

      <ul className="purchase-card__items">
        {items.map((item) => (
          <li key={`${item.raffleId}-${item.id}`}>
            <div>
              <strong>Cartela {item.code}</strong>
              <span>{item.raffleTitle}</span>
            </div>
            <TicketNumbers
              cardCode={item.code}
              numbers={item.numbers}
              secondChanceNumbers={item.secondChanceNumbers}
            />
            {canShare ? (
              <ShareReceiptButton
                purchase={purchase}
                items={[item]}
                label="Compartilhar"
                ariaLabel={`Compartilhar cartela ${item.code} no WhatsApp`}
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
