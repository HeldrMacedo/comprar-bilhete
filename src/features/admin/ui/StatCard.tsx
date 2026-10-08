import type { LucideIcon } from 'lucide-react'

type StatCardProps = {
  label: string
  value: string
  detail?: string
  icon: LucideIcon
  tone?: 'primary' | 'success' | 'warning' | 'danger'
}

export function StatCard({ label, value, detail, icon: Icon, tone = 'primary' }: StatCardProps) {
  return (
    <article className={`admin-stat admin-stat--${tone}`}>
      <div className="admin-stat__icon" aria-hidden="true">
        <Icon size={20} />
      </div>
      <div>
        <h2 className="admin-stat__label">{label}</h2>
        <p className="admin-stat__value">{value}</p>
        {detail ? <p className="admin-stat__detail">{detail}</p> : null}
      </div>
    </article>
  )
}
