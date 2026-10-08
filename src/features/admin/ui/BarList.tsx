type BarListProps = {
  title: string
  data: Array<{ key: string; label: string; value: number; detail?: string }>
  formatValue: (value: number) => string
  emptyMessage: string
}

// Barras horizontais em HTML: rótulos longos quebram linha e o texto é lido normalmente.
export function BarList({ title, data, formatValue, emptyMessage }: BarListProps) {
  if (data.length === 0) return <p className="admin-hint">{emptyMessage}</p>
  const max = Math.max(1, ...data.map((item) => item.value))

  return (
    <ul className="admin-bar-list" aria-label={title}>
      {data.map((item) => (
        <li key={item.key}>
          <div className="admin-bar-list__label">
            <span>{item.label}</span>
            <strong>
              {formatValue(item.value)}
              {item.detail ? <span className="admin-hint"> · {item.detail}</span> : null}
            </strong>
          </div>
          <div className="admin-bar-list__track" aria-hidden="true">
            <div
              className="admin-bar-list__fill"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
