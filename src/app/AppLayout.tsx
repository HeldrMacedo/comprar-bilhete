import { ShoppingBag } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'
import { AccountMenu } from '../features/account/ui/AccountMenu'
import { useCart } from '../features/cart/runtime/cart-context'

export function AppLayout() {
  const { itemCount } = useCart()

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
          <AccountMenu />
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
