import { useEffect, useState } from 'react'

function timeUntilDraw(drawDate: string, now: number) {
  const remainingSeconds = Math.max(0, Math.ceil((Date.parse(drawDate) - now) / 1000))
  const days = Math.floor(remainingSeconds / 86_400)
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600)
  const minutes = Math.floor((remainingSeconds % 3_600) / 60)
  const seconds = remainingSeconds % 60

  return { days, hours, minutes, seconds, started: remainingSeconds === 0 }
}

export function DrawCountdown({ drawDate }: { drawDate: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [drawDate])

  const remaining = timeUntilDraw(drawDate, now)

  return (
    <div className="draw-countdown" role="timer" aria-live="off">
      <span className="draw-countdown__label">Tempo para o sorteio</span>
      {remaining.started ? (
        <strong>Sorteio iniciado</strong>
      ) : (
        <strong>
          {remaining.days}d {String(remaining.hours).padStart(2, '0')}h{' '}
          {String(remaining.minutes).padStart(2, '0')}min{' '}
          {String(remaining.seconds).padStart(2, '0')}s
        </strong>
      )}
    </div>
  )
}
