import { Eraser, ExternalLink, ReceiptText } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Purchase } from '../features/purchases/domain/types'
import { useMyPurchases } from '../features/purchases/runtime/use-my-purchases'
import {
  describePaymentMethod,
  describeStatus,
} from '../features/purchases/service/purchase-labels'
import { ShareReceiptButton } from '../features/purchases/ui/ShareReceiptButton'
import { earliestSalesEnd } from '../features/checkout/service/sales-deadline'
import { formatCurrency } from '../shared/lib/currency'
import { ErrorState } from '../shared/ui/ErrorState'
import { SalesDeadlineNotice } from '../shared/ui/SalesDeadlineNotice'
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

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Fortaleza',
})

export function PurchasesPage() {
  const purchases = useMyPurchases()

  return (
    <section className="container page-section purchases-page">
      <div className="page-title">
        <span>
          <ReceiptText size={22} aria-hidden="true" />
        </span>
        <div>
          <h1>Minhas compras</h1>
          <p>Compras feitas com sua conta.</p>
        </div>
      </div>

      {purchases.isPending ? (
        <div className="purchases-state">
          <Spinner label="Buscando suas compras..." />
        </div>
      ) : purchases.isError ? (
        <ErrorState message={purchases.error.message} onRetry={() => void purchases.refetch()} />
      ) : purchases.data.length === 0 ? (
        <div className="surface purchases-state">
          <h2>Nenhuma compra encontrada</h2>
          <p>Ainda não há compras feitas com esta conta.</p>
          <Link className="button button--primary" to="/">
            Escolher bilhetes
          </Link>
        </div>
      ) : (
        <div className="purchase-list">
          {purchases.data.map((purchase) => (
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
  const shareableItems = items.filter((item) => item.validationStatus !== 'not_validated')
  const canShare = purchase.status === 'paid' && shareableItems.length > 0

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
        {purchase.refundDueInCents ? (
          <div>
            <dt>A estornar</dt>
            <dd>{formatCurrency(purchase.refundDueInCents)}</dd>
          </div>
        ) : null}
      </dl>

      {purchase.message ? <p className="purchase-card__message">{purchase.message}</p> : null}
      {purchase.status === 'pending' ? (
        <SalesDeadlineNotice salesEndAt={earliestSalesEnd(items)} />
      ) : null}

      <ul className="purchase-card__items">
        {items.map((item) => (
          <li key={`${item.raffleId}-${item.id}`}>
            <div>
              <strong>Bilhete {item.code}</strong>
              <span>{item.raffleTitle}</span>
              {item.validationStatus === 'not_validated' ? (
                <span className="status-badge status-badge--warning">Não validado</span>
              ) : null}
            </div>
            <InteractiveTicketNumbers
              cardCode={item.code}
              numbers={item.numbers}
              secondChanceNumbers={item.secondChanceNumbers}
            />
            {canShare && item.validationStatus !== 'not_validated' ? (
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
              items={shareableItems}
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
