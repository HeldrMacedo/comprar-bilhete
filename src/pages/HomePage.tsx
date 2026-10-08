import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight, Dices, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { CartSelection } from '../features/cart/domain/types'
import { useCart } from '../features/cart/runtime/cart-context'
import type { Raffle, RaffleCard } from '../features/raffle/domain/types'
import { raffleRepository } from '../features/raffle/repository/raffle-repository'
import { DrawCountdown } from '../features/raffle/ui/DrawCountdown'
import { RaffleCardOption } from '../features/raffle/ui/RaffleCardOption'
import { DrawVideo } from '../features/site/ui/DrawVideo'
import { formatCurrency } from '../shared/lib/currency'
import { formatDate, formatDrawDate, formatWeekday } from '../shared/lib/date'
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
    ? Math.min(draft.quantity, availableCount, 50)
    : draft.manualSelection.filter((selected) =>
        raffle.cards.some((card) => card.id === selected.id && card.available),
      ).length
}

function canAddRaffle(raffle: Raffle, draft: SelectionDraft) {
  return raffle.purchaseEnabled !== false && selectedQuantity(raffle, draft) > 0
}

function raffleDay(raffle: Raffle) {
  const day = formatWeekday(raffle.drawDate).replace('-feira', '')
  return day.charAt(0).toUpperCase() + day.slice(1)
}

export function HomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const notice = (location.state as { notice?: string } | null)?.notice
  const { setSelections } = useCart()
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [heroIndex, setHeroIndex] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, SelectionDraft>>({})
  const raffleQuery = useQuery({ queryKey: ['active-raffle'], queryFn: raffleRepository.getActive })

  const raffles = raffleQuery.data ?? []
  const selectedRaffles = raffles.filter(
    (raffle) =>
      !chosenId || !raffles.some((item) => item.id === chosenId) || raffle.id === chosenId,
  )
  const activeHeroIndex = raffles.length ? heroIndex % raffles.length : 0
  const heroRaffle = raffles[activeHeroIndex]
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
    selectedRaffles.every((raffle) => canAddRaffle(raffle, drafts[raffle.id] ?? initialDraft))

  function continueToCart(rafflesToAdd: Raffle[]) {
    if (
      !rafflesToAdd.length ||
      rafflesToAdd.some((raffle) => !canAddRaffle(raffle, drafts[raffle.id] ?? initialDraft))
    )
      return
    setSelections(
      rafflesToAdd.map((raffle) => {
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
      <section className="hero" aria-label="Concursos ativos" aria-roledescription="carrossel">
        <div className={`container hero__content${heroRaffle ? '' : ' hero__content--empty'}`}>
          <div className="hero__copy">
            <span className="eyebrow">
              <span /> {heroRaffle ? `Sorteio aberto · Concurso ${heroRaffle.id}` : 'Sol da Sorte'}
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
              <small>A partir de {formatCurrency(heroRaffle.priceInCents)} por bilhete</small>
              <DrawCountdown drawDate={heroRaffle.drawDate} />
            </div>
          ) : null}
          {raffles.length > 1 ? (
            <nav className="hero__navigation" aria-label="Navegar pelos concursos">
              <button
                type="button"
                className="hero__arrow"
                aria-label="Concurso anterior"
                onClick={() =>
                  setHeroIndex((index) => (index - 1 + raffles.length) % raffles.length)
                }
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <div className="hero__dots">
                {raffles.map((raffle, index) => (
                  <button
                    key={raffle.id}
                    type="button"
                    className="hero__dot"
                    aria-label={`Mostrar concurso ${raffle.id}`}
                    aria-current={index === activeHeroIndex ? 'true' : undefined}
                    onClick={() => setHeroIndex(index)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="hero__arrow"
                aria-label="Próximo concurso"
                onClick={() => setHeroIndex((index) => (index + 1) % raffles.length)}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
              <span className="hero__position" aria-live="polite">
                {activeHeroIndex + 1} de {raffles.length}
              </span>
            </nav>
          ) : null}
        </div>
      </section>

      {raffleQuery.isPending ? (
        <div className="container page-section" role="status">
          <Spinner label="Buscando o sorteio..." />
        </div>
      ) : raffles.length === 0 ? (
        <div className="empty-raffles-banner">
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
              <p>Participe de quarta-feira, domingo ou dos dois. Escolha os bilhetes de cada um.</p>
            </div>
          </div>

          <div className="raffle-choices" role="group" aria-label="Sorteios disponíveis">
            {raffles.length > 1 ? (
              <button
                type="button"
                className="raffle-choice"
                aria-pressed={!chosenId || !raffles.some((raffle) => raffle.id === chosenId)}
                onClick={() => {
                  setChosenId(null)
                  setHeroIndex(0)
                }}
              >
                Todos
              </button>
            ) : null}
            {raffles.map((raffle, index) => (
              <button
                className="raffle-choice"
                type="button"
                key={raffle.id}
                aria-pressed={raffles.length === 1 || chosenId === raffle.id}
                onClick={() => {
                  setChosenId(raffle.id)
                  setHeroIndex(index)
                }}
              >
                {raffleDay(raffle)}
              </button>
            ))}
          </div>

          {raffles.some((raffle) => raffle.purchaseEnabled === false) ? (
            <p className="availability-note" role="status">
              Compra temporariamente indisponível. Os sorteios estão disponíveis apenas para
              consulta.
            </p>
          ) : null}

          <div className="raffle-selections">
            {selectedRaffles.map((raffle) => {
              const draft = drafts[raffle.id] ?? initialDraft
              const availableCount = raffle.cards.filter((card) => card.available).length
              const maxQuantity = Math.min(availableCount, 50)
              const effectiveQuantity = Math.min(draft.quantity, maxQuantity)
              const updateDraft = (next: SelectionDraft) =>
                setDrafts((current) => ({ ...current, [raffle.id]: next }))
              return (
                <article className="raffle-selection" key={raffle.id}>
                  <header className="raffle-selection__header">
                    <strong>{raffleDay(raffle)} - Sol da Sorte</strong>
                    <span>{formatDrawDate(raffle.drawDate)}</span>
                  </header>
                  <div className="raffle-selection__meta">
                    <span>
                      Concurso: <strong>{raffle.id}</strong>
                    </span>
                    <span>
                      Bilhete: <strong>{formatCurrency(raffle.priceInCents)}</strong>
                    </span>
                    {raffle.doubleChance !== undefined ? (
                      <span>
                        Dupla chance: <strong>{raffle.doubleChance ? 'Sim' : 'Não'}</strong>
                      </span>
                    ) : null}
                  </div>
                  <div className="raffle-selection__prizes">
                    <h3>Premiação</h3>
                    {raffle.prizes?.length ? (
                      <ol>
                        {raffle.prizes.map((prize, index) => (
                          <li key={`${index}-${prize}`}>
                            <span>{index + 1}ª</span> {prize}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p>Prêmios a confirmar.</p>
                    )}
                    {raffle.luckySpins ? (
                      <p className="raffle-selection__spins">
                        {raffle.luckySpins.count} giros da sorte · {raffle.luckySpins.label}
                      </p>
                    ) : null}
                  </div>
                  <div className="mode-tabs" role="tablist" aria-label="Modo de escolha">
                    <button
                      role="tab"
                      aria-selected={draft.mode === 'random'}
                      className={draft.mode === 'random' ? 'active' : ''}
                      onClick={() => updateDraft({ ...draft, mode: 'random' })}
                    >
                      <Dices size={20} /> Escolha aleatória
                    </button>
                    {/*}
                  <button
                    role="tab"
                    aria-selected={draft.mode === 'manual'}
                    className={draft.mode === 'manual' ? 'active' : ''}
                    onClick={() => updateDraft({ ...draft, mode: 'manual' })}
                  >
                    <Ticket size={20} /> Escolher bilhetes
                  </button>
                  */}
                  </div>

                  {draft.mode === 'random' ? (
                    availableCount === 0 ? (
                      <p className="availability-note raffle-selection__unavailable" role="status">
                        Nenhum bilhete disponível para este sorteio.
                      </p>
                    ) : null
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

                  <footer className="raffle-selection__footer">
                    {draft.mode === 'random' ? (
                      <div className="raffle-selection__quantity">
                        <span>Quantidade de bilhetes</span>
                        <div className="quantity-picker" aria-label="Quantidade de bilhetes">
                          <button
                            type="button"
                            onClick={() =>
                              updateDraft({ ...draft, quantity: Math.max(1, draft.quantity - 1) })
                            }
                            disabled={effectiveQuantity <= 1}
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
                                quantity: Math.min(maxQuantity, draft.quantity + 1),
                              })
                            }
                            disabled={effectiveQuantity >= maxQuantity}
                            aria-label="Aumentar quantidade"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div className="raffle-selection__total">
                      <span>
                        {selectedQuantity(raffle, draft)}{' '}
                        {selectedQuantity(raffle, draft) === 1 ? 'bilhete' : 'bilhetes'}
                      </span>
                      <strong>
                        Total:{' '}
                        {formatCurrency(selectedQuantity(raffle, draft) * raffle.priceInCents)}
                      </strong>
                    </div>
                    {draft.mode === 'random' ? (
                      <div className="quick-quantities">
                        {[1, 3, 5, 10]
                          .filter((value) => value <= maxQuantity)
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
                    ) : null}
                    <button
                      className="button button--primary"
                      type="button"
                      disabled={!canAddRaffle(raffle, draft)}
                      onClick={() => continueToCart([raffle])}
                    >
                      Adicionar ao carrinho <ChevronRight size={18} />
                    </button>
                  </footer>
                </article>
              )
            })}
          </div>

          {selectedRaffles.length > 1 ? (
            <aside className="selection-bar">
              <div>
                <span>
                  {selectedCount} {selectedCount === 1 ? 'bilhete' : 'bilhetes'}
                </span>
                <strong>{formatCurrency(totalInCents)}</strong>
              </div>
              <button
                className="button button--primary"
                type="button"
                disabled={!canContinue}
                onClick={() => continueToCart(selectedRaffles)}
              >
                Adicionar todos ao carrinho <ChevronRight size={19} />
              </button>
            </aside>
          ) : null}
        </section>
      )}

      <DrawVideo />
    </>
  )
}
