import { useId, useState } from 'react'
import type { AdminOrder, OrderAction } from '../domain/types'
import { formatCurrency } from '../../../shared/lib/currency'
import { ConfirmDialog } from './ConfirmDialog'

type OrderActionDialogProps = {
  order: AdminOrder | null
  action: OrderAction
  pending: boolean
  error: string | null
  onConfirm: (reason: string) => void
  onClose: () => void
}

function describe(order: AdminOrder, action: OrderAction) {
  const total = formatCurrency(order.totalInCents)
  if (action === 'cancel') {
    return order.status === 'manual_review'
      ? `O pagamento deste pedido (${total}) já foi recebido. Cancelar não estorna o valor: faça o estorno fora do sistema.`
      : `Os bilhetes do pedido (${total}) voltam a ficar disponíveis para venda.`
  }
  return order.status === 'manual_review'
    ? 'Os bilhetes serão validados novamente na API de bilhetes. Se algum já tiver sido vendido, a tentativa é recusada.'
    : `Confirme que o pagamento de ${total} foi recebido. Os bilhetes serão validados na API de bilhetes.`
}

export function OrderActionDialog({
  order,
  action,
  pending,
  error,
  onConfirm,
  onClose,
}: OrderActionDialogProps) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const reasonId = useId()
  const invalid = reason.trim().length < 5
  const title =
    action === 'cancel'
      ? 'Cancelar pedido'
      : order?.status === 'manual_review'
        ? 'Tentar entregar novamente'
        : 'Aprovar pagamento manualmente'

  return (
    <ConfirmDialog
      title={title}
      open={order !== null}
      tone={action === 'cancel' ? 'danger' : 'primary'}
      confirmLabel={action === 'cancel' ? 'Cancelar pedido' : 'Aprovar'}
      pending={pending}
      error={error}
      onClose={onClose}
      onConfirm={() => {
        setTouched(true)
        if (!invalid) onConfirm(reason.trim())
      }}
    >
      {order ? (
        <>
          <p>
            Pedido de <strong>{order.customer.name}</strong>, {order.items.length}{' '}
            {order.items.length === 1 ? 'bilhete' : 'bilhetes'}.
          </p>
          <p>{describe(order, action)}</p>
          <div className="field">
            <label htmlFor={reasonId}>Motivo</label>
            <textarea
              id={reasonId}
              className="admin-textarea"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={touched && invalid}
            />
            {touched && invalid ? (
              <small role="alert">Informe o motivo (mínimo 5 caracteres).</small>
            ) : null}
          </div>
        </>
      ) : null}
    </ConfirmDialog>
  )
}
