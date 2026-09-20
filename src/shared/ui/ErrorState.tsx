import { CircleAlert } from 'lucide-react'

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <section className="state-card" role="alert">
      <CircleAlert aria-hidden="true" size={30} />
      <h2>Algo não saiu como esperado</h2>
      <p>{message}</p>
      {onRetry ? (
        <button className="button button--secondary" type="button" onClick={onRetry}>
          Tentar novamente
        </button>
      ) : null}
    </section>
  )
}
