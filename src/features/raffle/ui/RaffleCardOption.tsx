import { Check } from 'lucide-react'
import { TicketNumbers } from '../../../shared/ui/TicketNumbers'
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
        <strong>Bilhete {card.code}</strong>
        {selected ? <Check size={18} aria-label="Selecionada" /> : null}
      </span>
      <TicketNumbers
        cardCode={card.code}
        numbers={card.numbers}
        secondChanceNumbers={card.secondChanceNumbers}
        variant="grid"
      />
      {!card.available ? <span className="raffle-card__unavailable">Indisponível</span> : null}
    </button>
  )
}
