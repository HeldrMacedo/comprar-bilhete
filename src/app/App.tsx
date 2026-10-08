import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { handleAdminUnauthenticated } from '../features/admin/runtime/admin-queries'
import { CartProvider } from '../features/cart/runtime/CartProvider'
import { Spinner } from '../shared/ui/Spinner'
import { AppLayout } from './AppLayout'
import { CartPage } from '../pages/CartPage'
import { HomePage } from '../pages/HomePage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { PaymentPage } from '../pages/PaymentPage'
import { PurchasesPage } from '../pages/PurchasesPage'

const AdminRoutes = lazy(() => import('./AdminRoutes'))

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => handleAdminUnauthenticated(queryClient, error, query.queryKey),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) =>
      handleAdminUnauthenticated(queryClient, error, mutation.options.mutationKey),
  }),
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="admin/*"
              element={
                <Suspense fallback={<Spinner label="Carregando painel" />}>
                  <AdminRoutes />
                </Suspense>
              }
            />
            <Route element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="carrinho" element={<CartPage />} />
              <Route path="pagamento" element={<PaymentPage />} />
              <Route path="minhas-compras" element={<PurchasesPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </QueryClientProvider>
  )
}
