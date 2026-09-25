import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronRight, Dices, ShieldCheck, Ticket } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { CartSelection } from '../features/cart/domain/types'
import { useCart } from '../features/cart/runtime/cart-context'
import type { Raffle, RaffleCard } from '../features/raffle/domain/types'
import { raffleRepository } from '../features/raffle/repository/raffle-repository'
import { RaffleCardOption } from '../features/raffle/ui/RaffleCardOption'
import { formatCurrency } from '../shared/lib/currency'
import { formatDate, formatWeekday } from '../shared/lib/date'
import { Spinner } from '../shared/ui/Spinner'

type SelectionMode = 'random' | 'manual'
type SelectionDraft = {
  mode: SelectionMode
  quantity: number
  manualSelection: RaffleCard[]
}

const initialDraft: SelectionDraft = { mode: 'random', quantity: 1, manualSelection: [] }

function selectedQuantity(raffle: Raffle, draft: SelectionDraft) {
  const availableCount = raffle.cards.filter((card) => card.available).length
  return draft.mode === 'random'
    ? Math.min(draft.quantity, availableCount)
    : draft.manualSelection.filter((selected) =>
        raffle.cards.some((card) => card.id === selected.id && card.available),
      ).length
}

export function HomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const notice = (location.state as { notice?: string } | null)?.notice
  const { setSelections } = useCart()
  const [chosenIds, setChosenIds] = useState<string[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, SelectionDraft>>({})
  const raffleQuery = useQuery({ queryKey: ['active-raffle'], queryFn: raffleRepository.getActive })

  const raffles = raffleQuery.data ?? []
  const selectedIds = chosenIds ?? (raffles[0] ? [raffles[0].id] : [])
  const selectedRaffles = raffles.filter((raffle) => selectedIds.includes(raffle.id))
  const heroRaffle = selectedRaffles[0] ?? raffles[0]
  const selectedCount = selectedRaffles.reduce(
    (count, raffle) => count + selectedQuantity(raffle, drafts[raffle.id] ?? initialDraft),
    0,
  )
  const totalInCents = selectedRaffles.reduce(
    (total, raffle) =>
      total + selectedQuantity(raffle, drafts[raffle.id] ?? initialDraft) * raffle.priceInCents,
    0,
  )
  const canContinue =
    selectedRaffles.length > 0 &&
    selectedRaffles.every(
      (raffle) =>
        raffle.purchaseEnabled !== false &&
        selectedQuantity(raffle, drafts[raffle.id] ?? initialDraft) > 0,
    )

  function continueToCart() {
    if (!canContinue) return
    setSelections(
      selectedRaffles.map((raffle) => {
        const draft = drafts[raffle.id] ?? initialDraft
        const selection: CartSelection =
          draft.mode === 'random'
            ? { mode: 'random', quantity: selectedQuantity(raffle, draft) }
            : {
                mode: 'manual',
                cards: draft.manualSelection.filter((selected) =>
                  raffle.cards.some((card) => card.id === selected.id && card.available),
                ),
              }
        return { raffle, selection }
      }),
    )
    navigate('/carrinho')
  }

  return (
    <>
      {notice ? (
        <div className="container inline-error" role="alert">
          {notice}
        </div>
      ) : null}
      <section className="hero">
        <div className={`container hero__content${heroRaffle ? '' : ' hero__content--empty'}`}>
          <div className="hero__copy">
            <span className="eyebrow">
              <span /> {heroRaffle ? 'Sorteio aberto' : 'Bilhete da Sorte'}
            </span>
            <h1>Seu próximo número pode mudar tudo.</h1>
            <p>{heroRaffle?.description ?? 'Acompanhe os próximos sorteios por aqui.'}</p>
            <div className="hero__facts">
              {heroRaffle ? (
                <span>
                  <CalendarDays size={18} /> Sorteio em {formatDate(heroRaffle.drawDate)}
                </span>
              ) : null}
              <span>
                <ShieldCheck size={18} /> Compra segura via Pix
              </span>
            </div>
          </div>
          {heroRaffle ? (
            <div className="prize-card">
              <span>Prêmio principal</span>
              <strong>{heroRaffle.prize}</strong>
              <small>A partir de {formatCurrency(heroRaffle.priceInCents)} por cartela</small>
            </div>
          ) : null}
        </div>
      </section>

      {raffleQuery.isPending ? (
        <div className="container page-section" role="status">
          <Spinner label="Buscando o sorteio..." />
        </div>
      ) : raffles.length === 0 ? (
        <div style={{ width: '100%', backgroundColor: '#18dcff' }}>
          <section
            className="container page-section"
            role={raffleQuery.isError ? 'alert' : 'status'}
          >
            <h2>Sem sorteios ativo no momento</h2>
          </section>
        </div>
      ) : (
        <section className="container purchase-section">
          <div className="section-heading">
            <span>01</span>
            <div>
              <h2>Escolha os sorteios</h2>
              <p>Participe de quarta-feira, domingo ou dos dois. Escolha as cartelas de cada um.</p>
            </div>
          </div>

          <div className="raffle-choices" role="group" aria-label="Sorteios disponíveis">
            {raffles.map((raffle) => (
              <label className="raffle-choice" key={raffle.id}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(raffle.id)}
                  onChange={() =>
                    setChosenIds((current) => {
                      const selected =
                        current ?? [raffles[0]?.id].filter((id): id is string => !!id)
                      return selected.includes(raffle.id)
                        ? selected.filter((id) => id !== raffle.id)
                        : [...selected, raffle.id]
                    })
                  }
                />
                <span>
                  <strong>{formatWeekday(raffle.drawDate)}</strong>
                  <small>
                    {formatDate(raffle.drawDate)} · {formatCurrency(raffle.priceInCents)} por
                    cartela
                  </small>
                </span>
              </label>
            ))}
          </div>

          {raffles.some((raffle) => raffle.purchaseEnabled === false) ? (
            <p className="availability-note" role="status">
              Compra temporariamente indisponível. Os sorteios estão disponíveis apenas para
              consulta.
            </p>
          ) : null}

          {selectedRaffles.map((raffle) => {
            const draft = drafts[raffle.id] ?? initialDraft
            const availableCount = raffle.cards.filter((card) => card.available).length
            const effectiveQuantity = Math.min(draft.quantity, availableCount)
            const updateDraft = (next: SelectionDraft) =>
              setDrafts((current) => ({ ...current, [raffle.id]: next }))
            return (
              <div className="raffle-selection" key={raffle.id}>
                <h3>
                  {raffle.title} · {formatWeekday(raffle.drawDate)}
                </h3>
                <div className="mode-tabs" role="tablist" aria-label="Modo de escolha">
                  <button
                    role="tab"
                    aria-selected={draft.mode === 'random'}
                    className={draft.mode === 'random' ? 'active' : ''}
                    onClick={() => updateDraft({ ...draft, mode: 'random' })}
                  >
                    <Dices size={20} /> Escolha aleatória
                  </button>
                  <button
                    role="tab"
                    aria-selected={draft.mode === 'manual'}
                    className={draft.mode === 'manual' ? 'active' : ''}
                    onClick={() => updateDraft({ ...draft, mode: 'manual' })}
                  >
                    <Ticket size={20} /> Escolher cartelas
                  </button>
                </div>

                {draft.mode === 'random' ? (
                  <div className="random-panel">
                    <div>
                      <h3>Quantas cartelas?</h3>
                      <p>Selecionaremos cartelas disponíveis de forma aleatória.</p>
                    </div>
                    <div className="quantity-picker" aria-label="Quantidade de cartelas">
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft({ ...draft, quantity: Math.max(1, draft.quantity - 1) })
                        }
                        disabled={availableCount === 0}
                        aria-label="Diminuir quantidade"
                      >
                        −
                      </button>
                      <strong>{effectiveQuantity}</strong>
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft({
                            ...draft,
                            quantity: Math.min(availableCount, draft.quantity + 1),
                          })
                        }
                        disabled={availableCount === 0}
                        aria-label="Aumentar quantidade"
                      >
                        +
                      </button>
                    </div>
                    {availableCount === 0 ? (
                      <p className="availability-note" role="status">
                        Nenhuma cartela disponível para este sorteio.
                      </p>
                    ) : null}
                    <div className="quick-quantities">
                      {[1, 3, 5, 10]
                        .filter((value) => value <= availableCount)
                        .map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={draft.quantity === value ? 'active' : ''}
                            onClick={() => updateDraft({ ...draft, quantity: value })}
                          >
                            {value}
                          </button>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div className="manual-panel">
                    <div className="manual-panel__header">
                      <p>
                        <strong>{draft.manualSelection.length}</strong> selecionada(s) de{' '}
                        {availableCount} disponíveis
                      </p>
                      {draft.manualSelection.length ? (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => updateDraft({ ...draft, manualSelection: [] })}
                        >
                          Limpar seleção
                        </button>
                      ) : null}
                    </div>
                    <div className="cards-grid">
                      {raffle.cards.map((card) => (
                        <RaffleCardOption
                          key={card.id}
                          card={card}
                          selected={draft.manualSelection.some((item) => item.id === card.id)}
                          onToggle={() =>
                            updateDraft({
                              ...draft,
                              manualSelection: draft.manualSelection.some(
                                (item) => item.id === card.id,
                              )
                                ? draft.manualSelection.filter((item) => item.id !== card.id)
                                : [...draft.manualSelection, card],
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          <aside className="selection-bar">
            <div>
              <span>
                {selectedCount} {selectedCount === 1 ? 'cartela' : 'cartelas'}
              </span>
              <strong>{formatCurrency(totalInCents)}</strong>
            </div>
            <button
              className="button button--primary"
              type="button"
              disabled={!canContinue}
              onClick={continueToCart}
            >
              Ir para o carrinho <ChevronRight size={19} />
            </button>
          </aside>
        </section>
      )}
    </>
  )
}
