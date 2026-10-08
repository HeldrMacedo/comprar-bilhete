import { Route, Routes } from 'react-router-dom'
import { RequireAdmin } from '../features/admin/ui/RequireAdmin'
import { AdminCustomersPage } from '../pages/admin/AdminCustomersPage'
import { AdminHomePage } from '../pages/admin/AdminHomePage'
import { AdminLoginPage } from '../pages/admin/AdminLoginPage'
import { AdminRafflesPage } from '../pages/admin/AdminRafflesPage'
import { AdminSalesPage } from '../pages/admin/AdminSalesPage'
import { AdminSettingsPage } from '../pages/admin/AdminSettingsPage'
import { AdminUsersPage } from '../pages/admin/AdminUsersPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { AdminLayout } from './AdminLayout'
import './admin.css'

// Carregado sob demanda pelo App: o código do painel não entra no bundle do site público.
export default function AdminRoutes() {
  return (
    <Routes>
      <Route path="login" element={<AdminLoginPage />} />
      <Route
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<AdminHomePage />} />
        <Route path="sorteios" element={<AdminRafflesPage />} />
        <Route path="vendas" element={<AdminSalesPage />} />
        <Route path="clientes" element={<AdminCustomersPage />} />
        <Route path="configuracoes" element={<AdminSettingsPage />} />
        <Route path="usuarios" element={<AdminUsersPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
