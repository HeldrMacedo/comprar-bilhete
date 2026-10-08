// Só usa <span> para poder ficar dentro do <button> do bilhete.
export function TicketNumbers({
  cardCode,
  numbers,
  secondChanceNumbers = [],
  variant = 'list',
}: {
  cardCode: string
  numbers: number[]
  secondChanceNumbers?: number[]
  variant?: 'grid' | 'list'
}) {
  const groups = secondChanceNumbers.length
    ? [
        { chance: '1ª chance', numbers },
        { chance: '2ª chance', numbers: secondChanceNumbers },
      ]
    : [{ chance: undefined, numbers }]

  return (
    <span className="ticket-numbers">
      {groups.map((group) => (
        <span className="ticket-numbers__group" key={group.chance ?? 'única'}>
          {group.chance ? (
            <span className="ticket-numbers__chance" aria-hidden="true">
              {group.chance}
            </span>
          ) : null}
          <span
            className={`number-${variant}`}
            aria-label={
              group.chance
                ? `Dezenas do bilhete ${cardCode} (${group.chance})`
                : `Dezenas do bilhete ${cardCode}`
            }
          >
            {group.numbers.map((number, index) => (
              <span key={index}>{String(number).padStart(2, '0')}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}
