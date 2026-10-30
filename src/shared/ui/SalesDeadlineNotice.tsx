import { AlarmClock } from 'lucide-react'
import { salesDeadlineMessage } from '../lib/sales-deadline'

export function SalesDeadlineNotice({
  salesEndAt,
  title,
}: {
  salesEndAt?: string
  title?: string
}) {
  return (
    <p className="sales-deadline-notice" role="note">
      <AlarmClock size={16} aria-hidden="true" />
      <span>
        {title ? <strong>{title}: </strong> : null}
        {salesDeadlineMessage(salesEndAt)}
      </span>
    </p>
  )
}
