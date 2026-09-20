import { Check } from 'lucide-react'
import type { RaffleCard } from '../domain/types'

export function RaffleCardOption({
  card,
  selected,
  onToggle,
}: {
  card: RaffleCard
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      className={`raffle-card ${selected ? 'raffle-card--selected' : ''}`}
      type="button"
      onClick={onToggle}
      disabled={!card.available}
      aria-pressed={selected}
    >
      <span className="raffle-card__topline">
        <strong>Cartela {card.code}</strong>
        {selected ? <Check size={18} aria-label="Selecionada" /> : null}
      </span>
      <span className="number-grid" aria-label={`Números: ${card.numbers.join(', ')}`}>
        {card.numbers.map((number, index) => (
          <span key={`${card.id}-${index}`}>{String(number).padStart(2, '0')}</span>
        ))}
      </span>
      {!card.available ? <span className="raffle-card__unavailable">Indisponível</span> : null}
    </button>
  )
}
