import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronRight, Dices, ShieldCheck, Ticket } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../features/cart/runtime/cart-context'
import type { RaffleCard } from '../features/raffle/domain/types'
import { raffleRepository } from '../features/raffle/repository/raffle-repository'
import { selectRandomCards } from '../features/raffle/service/card-selection'
import { RaffleCardOption } from '../features/raffle/ui/RaffleCardOption'
import { formatCurrency } from '../shared/lib/currency'
import { formatDate } from '../shared/lib/date'
import { ErrorState } from '../shared/ui/ErrorState'
import { Spinner } from '../shared/ui/Spinner'

type SelectionMode = 'random' | 'manual'

export function HomePage() {
  const navigate = useNavigate()
  const { setSelection } = useCart()
  const [mode, setMode] = useState<SelectionMode>('random')
  const [quantity, setQuantity] = useState(1)
  const [manualSelection, setManualSelection] = useState<RaffleCard[]>([])
  const raffleQuery = useQuery({ queryKey: ['active-raffle'], queryFn: raffleRepository.getActive })

  const availableCount = useMemo(
    () => raffleQuery.data?.cards.filter((card) => card.available).length ?? 0,
    [raffleQuery.data],
  )
  const effectiveQuantity = Math.min(quantity, availableCount)
  const selectedCount = mode === 'random' ? effectiveQuantity : manualSelection.length

  if (raffleQuery.isPending) {
    return (
      <div className="page-center">
        <Spinner label="Buscando o sorteio..." />
      </div>
    )
  }

  if (raffleQuery.isError) {
    return (
      <div className="container page-section">
        <ErrorState
          message={raffleQuery.error.message}
          onRetry={() => void raffleQuery.refetch()}
        />
      </div>
    )
  }

  const raffle = raffleQuery.data

  function toggleCard(card: RaffleCard) {
    setManualSelection((current) =>
      current.some((item) => item.id === card.id)
        ? current.filter((item) => item.id !== card.id)
        : [...current, card],
    )
  }

  function continueToCart() {
    const cards = mode === 'random' ? selectRandomCards(raffle.cards, quantity) : manualSelection
    if (!cards.length) return
    setSelection(raffle, cards)
    navigate('/carrinho')
  }

  return (
    <>
      <section className="hero">
        <div className="container hero__content">
          <div className="hero__copy">
            <span className="eyebrow">
              <span /> Sorteio aberto
            </span>
            <h1>Seu próximo número pode mudar tudo.</h1>
            <p>{raffle.description}</p>
            <div className="hero__facts">
              <span>
                <CalendarDays size={18} /> Sorteio em {formatDate(raffle.drawDate)}
              </span>
              <span>
                <ShieldCheck size={18} /> Compra segura via Pix
              </span>
            </div>
          </div>
          <div className="prize-card">
            <span>Prêmio principal</span>
            <strong>{raffle.prize}</strong>
            <small>A partir de {formatCurrency(raffle.priceInCents)} por cartela</small>
          </div>
        </div>
      </section>

      <section className="container purchase-section">
        <div className="section-heading">
          <span>01</span>
          <div>
            <h2>Como você quer escolher?</h2>
            <p>Deixe a sorte decidir ou veja os números de cada cartela.</p>
          </div>
        </div>

        <div className="mode-tabs" role="tablist" aria-label="Modo de escolha">
          <button
            role="tab"
            aria-selected={mode === 'random'}
            className={mode === 'random' ? 'active' : ''}
            onClick={() => setMode('random')}
          >
            <Dices size={20} /> Escolha aleatória
          </button>
          <button
            role="tab"
            aria-selected={mode === 'manual'}
            className={mode === 'manual' ? 'active' : ''}
            onClick={() => setMode('manual')}
          >
            <Ticket size={20} /> Escolher cartelas
          </button>
        </div>

        {mode === 'random' ? (
          <div className="random-panel">
            <div>
              <h3>Quantas cartelas?</h3>
              <p>Selecionaremos cartelas disponíveis de forma aleatória.</p>
            </div>
            <div className="quantity-picker" aria-label="Quantidade de cartelas">
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                disabled={availableCount === 0}
                aria-label="Diminuir quantidade"
              >
                −
              </button>
              <strong>{effectiveQuantity}</strong>
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.min(availableCount, value + 1))}
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
                    className={quantity === value ? 'active' : ''}
                    onClick={() => setQuantity(value)}
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
                <strong>{manualSelection.length}</strong> selecionada(s) de {availableCount}{' '}
                disponíveis
              </p>
              {manualSelection.length ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setManualSelection([])}
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
                  selected={manualSelection.some((item) => item.id === card.id)}
                  onToggle={() => toggleCard(card)}
                />
              ))}
            </div>
          </div>
        )}

        <aside className="selection-bar">
          <div>
            <span>
              {selectedCount} {selectedCount === 1 ? 'cartela' : 'cartelas'}
            </span>
            <strong>{formatCurrency(selectedCount * raffle.priceInCents)}</strong>
          </div>
          <button
            className="button button--primary"
            type="button"
            disabled={selectedCount === 0}
            onClick={continueToCart}
          >
            Ir para o carrinho <ChevronRight size={19} />
          </button>
        </aside>
      </section>
    </>
  )
}
