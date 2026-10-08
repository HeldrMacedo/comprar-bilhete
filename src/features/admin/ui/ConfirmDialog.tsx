import type { ReactNode } from 'react'
import { Dialog } from './Dialog'

type ConfirmDialogProps = {
  title: string
  open: boolean
  confirmLabel: string
  tone?: 'danger' | 'primary'
  pending?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
  children: ReactNode
}

export function ConfirmDialog({
  title,
  open,
  confirmLabel,
  tone = 'primary',
  pending = false,
  error,
  onConfirm,
  onClose,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      title={title}
      open={open}
      onClose={onClose}
      footer={
        <>
          <button className="button button--secondary" type="button" onClick={onClose}>
            Voltar
          </button>
          <button
            className={`button ${tone === 'danger' ? 'button--danger' : 'button--primary'}`}
            type="button"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'Aguarde…' : confirmLabel}
          </button>
        </>
      }
    >
      {children}
      {error ? (
        <p className="admin-form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  )
}
