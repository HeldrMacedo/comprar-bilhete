export function Spinner({ label = 'Carregando' }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <span className="spinner__circle" aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}
