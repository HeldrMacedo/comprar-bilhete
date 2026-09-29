import { ReceiptText, ShoppingBag, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useCart } from '../features/cart/runtime/cart-context'
import { formatCpf, isValidCpf, onlyDigits } from '../shared/lib/forms'

export function AppLayout() {
  const { itemCount } = useCart()
  const navigate = useNavigate()
  const [cpf, setCpf] = useState('')

  function openPurchases(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // CPF vai por history.state para não ficar na URL; sem CPF válido a página pede o dado.
    navigate('/minhas-compras', isValidCpf(cpf) ? { state: { cpf: onlyDigits(cpf) } } : {})
    setCpf('')
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Bilhete da Sorte — início">
          <span className="brand__mark" aria-hidden="true">
            <Sparkles size={20} />
          </span>
          <span>
            <strong>Bilhete</strong> da Sorte
          </span>
        </Link>
        <div className="site-header__actions">
          <form className="purchase-search" role="search" onSubmit={openPurchases}>
            <input
              aria-label="CPF para consultar compras"
              placeholder="Seu CPF"
              inputMode="numeric"
              autoComplete="off"
              value={cpf}
              onChange={(event) => setCpf(formatCpf(event.target.value))}
            />
            <button type="submit" className="cart-link" aria-label="Minhas compras">
              <ReceiptText size={20} aria-hidden="true" />
              <span className="cart-link__label">Minhas compras</span>
            </button>
          </form>
          <Link
            className="cart-link"
            to="/carrinho"
            aria-label={`Carrinho com ${itemCount} cartelas`}
          >
            <ShoppingBag size={20} aria-hidden="true" />
            <span className="cart-link__label">Carrinho</span>
            {itemCount > 0 ? <span className="cart-link__count">{itemCount}</span> : null}
          </Link>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <p>Pagamento protegido pela InfinitePay</p>
        <p>Jogue com responsabilidade. Proibido para menores de 18 anos.</p>
      </footer>
    </div>
  )
}
