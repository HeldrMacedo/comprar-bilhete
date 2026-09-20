import { ShoppingBag, Sparkles } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'
import { useCart } from '../features/cart/runtime/cart-context'

export function AppLayout() {
  const { itemCount } = useCart()

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
        <Link
          className="cart-link"
          to="/carrinho"
          aria-label={`Carrinho com ${itemCount} cartelas`}
        >
          <ShoppingBag size={20} aria-hidden="true" />
          <span className="cart-link__label">Carrinho</span>
          {itemCount > 0 ? <span className="cart-link__count">{itemCount}</span> : null}
        </Link>
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
