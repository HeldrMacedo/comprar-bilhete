import { ChevronDown, UserRound } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAccount, useLogout } from '../runtime/account-queries'

// Sem sessão, link para entrar; com sessão, menu com compras, dados e sair.
export function AccountMenu() {
  const account = useAccount()
  const logout = useLogout()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    menuItems(menuRef.current)[0]?.focus()
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [open])

  if (!account.data) {
    return (
      <Link className="cart-link" to="/entrar" aria-label="Entrar">
        <UserRound size={20} aria-hidden="true" />
        <span className="cart-link__label">Entrar</span>
      </Link>
    )
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = menuItems(menuRef.current)
    const current = items.indexOf(document.activeElement as HTMLElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    items[(current + step + items.length) % items.length]?.focus()
  }

  function signOut() {
    setOpen(false)
    logout.mutate(undefined, { onSuccess: () => navigate('/') })
  }

  return (
    <div className="account-menu" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className="cart-link"
        aria-label="Minha conta"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'account-menu-list' : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <UserRound size={20} aria-hidden="true" />
        <span className="cart-link__label">Minha conta</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id="account-menu-list"
          className="account-menu__list"
          role="menu"
          aria-label="Minha conta"
          ref={menuRef}
          onKeyDown={onMenuKeyDown}
        >
          <Link
            className="account-menu__item"
            role="menuitem"
            tabIndex={-1}
            to="/minhas-compras"
            onClick={() => setOpen(false)}
          >
            Minhas compras
          </Link>
          <Link
            className="account-menu__item"
            role="menuitem"
            tabIndex={-1}
            to="/minha-conta"
            onClick={() => setOpen(false)}
          >
            Meus dados
          </Link>
          <button
            className="account-menu__item"
            role="menuitem"
            tabIndex={-1}
            type="button"
            onClick={signOut}
            disabled={logout.isPending}
          >
            Sair
          </button>
        </div>
      ) : null}
    </div>
  )
}

function menuItems(menu: HTMLElement | null) {
  return Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
}
