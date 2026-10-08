import { ReceiptText, ShoppingBag } from 'lucide-react'
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
        <Link className="brand" to="/" aria-label="Sol da Sorte — início">
          <img
            src="https://sistemalotericoba.com.br/wp-content/uploads/2022/05/logo-sol-da-sorte-2.png"
            alt="Sol da Sorte"
            className="brand__logo"
            width={624}
            height={357}
          />
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
            aria-label={`Carrinho com ${itemCount} bilhetes`}
          >
            <ShoppingBag size={20} aria-hidden="true" />
            <span className="cart-link__label">Carrinho</span>
            <img
              src="https://sistemalotericoba.com.br/wp-content/uploads/2022/07/MASCOTE-SOL_COREL-1-150x150.png"
              alt=""
              aria-hidden="true"
              className="cart-link__mascot"
              width={150}
              height={150}
            />
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
