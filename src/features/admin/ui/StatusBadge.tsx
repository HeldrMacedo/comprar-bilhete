import type { BadgeTone } from '../service/order-labels'

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: string }) {
  return <span className={`admin-badge admin-badge--${tone}`}>{children}</span>
}
