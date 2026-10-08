import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

type DialogProps = {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

// <dialog> nativo: foco preso, Esc fecha e o restante da página fica inerte.
export function Dialog({ title, open, onClose, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className="admin-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      {open ? (
        <>
          <header className="admin-dialog__header">
            <h2 id={titleId}>{title}</h2>
            <button
              type="button"
              className="admin-icon-button"
              aria-label="Fechar"
              onClick={onClose}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="admin-dialog__body">{children}</div>
          {footer ? <footer className="admin-dialog__footer">{footer}</footer> : null}
        </>
      ) : null}
    </dialog>
  )
}
