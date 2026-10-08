import {
  CalendarCog,
  Contact,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  Users,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAdminLogout, useAdminSession } from '../features/admin/runtime/admin-queries'

const navigation = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/sorteios', label: 'Sorteios', icon: CalendarCog, end: false },
  { to: '/admin/vendas', label: 'Vendas', icon: ReceiptText, end: false },
  { to: '/admin/clientes', label: 'Clientes', icon: Contact, end: false },
  { to: '/admin/configuracoes', label: 'Configurações', icon: Settings, end: false },
  { to: '/admin/usuarios', label: 'Usuários do sistema', icon: Users, end: false },
]

export function AdminLayout() {
  const session = useAdminSession()
  const logout = useAdminLogout()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  function signOut() {
    logout.mutate(undefined, { onSettled: () => navigate('/admin/login', { replace: true }) })
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <button
          type="button"
          className="admin-icon-button admin-topbar__menu"
          aria-expanded={menuOpen}
          aria-controls="admin-nav"
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
        <strong className="admin-topbar__brand">Painel Sol da Sorte</strong>
        <div className="admin-topbar__user">
          <span>{session.data?.name}</span>
          <button
            type="button"
            className="button button--secondary admin-button--small"
            onClick={signOut}
            disabled={logout.isPending}
          >
            <LogOut size={16} aria-hidden="true" />
            Sair
          </button>
        </div>
      </header>
      <nav
        id="admin-nav"
        className="admin-sidebar"
        data-open={menuOpen}
        aria-label="Menu do painel"
      >
        {navigation.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="admin-sidebar__link"
            onClick={() => setMenuOpen(false)}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
