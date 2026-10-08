import { Download, Search } from 'lucide-react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { CustomerSummary } from '../../features/admin/domain/types'
import { useAdminCustomers, useExportCustomers } from '../../features/admin/runtime/admin-queries'
import {
  readCustomerFilters,
  readPage,
  toSearchParams,
} from '../../features/admin/service/list-params'
import { DataTable, type Column } from '../../features/admin/ui/DataTable'
import { Pagination } from '../../features/admin/ui/Pagination'
import { formatCurrency } from '../../shared/lib/currency'
import { formatDateTime } from '../../shared/lib/date'
import { formatCpf, formatPhone } from '../../shared/lib/forms'

const columns: Column<CustomerSummary>[] = [
  {
    key: 'name',
    header: 'Cliente',
    render: (customer) => (
      <div className="admin-cell-stack">
        <strong>{customer.name}</strong>
        <span>{formatCpf(customer.cpf)}</span>
      </div>
    ),
  },
  { key: 'phone', header: 'Celular', render: (customer) => formatPhone(customer.phone) },
  {
    key: 'city',
    header: 'Cidade',
    render: (customer) =>
      customer.address ? `${customer.address.city}/${customer.address.state}` : '—',
  },
  {
    key: 'orders',
    header: 'Pedidos',
    align: 'end',
    render: (customer) => `${customer.paidOrderCount} pagos de ${customer.orderCount}`,
  },
  { key: 'tickets', header: 'Bilhetes', align: 'end', render: (customer) => customer.ticketCount },
  {
    key: 'total',
    header: 'Total pago',
    align: 'end',
    render: (customer) => formatCurrency(customer.paidTotalInCents),
  },
  {
    key: 'last',
    header: 'Último pedido',
    render: (customer) => formatDateTime(customer.lastOrderAt),
  },
]

export function AdminCustomersPage() {
  const [params, setParams] = useSearchParams()
  const filters = readCustomerFilters(params)
  const page = readPage(params)
  const customers = useAdminCustomers(filters, page)
  const exportCustomers = useExportCustomers()

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = (key: string) => {
      const entry = form.get(key)
      return typeof entry === 'string' ? entry : undefined
    }
    setParams(
      toSearchParams({
        q: value('q'),
        compra: value('compra'),
        de: value('de'),
        ate: value('ate'),
      }),
    )
  }

  function goToPage(next: number) {
    const updated = new URLSearchParams(params)
    updated.set('pagina', String(next))
    setParams(updated)
  }

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>Clientes</h1>
          <p>Quem já fez pedido no site, com os dados do pedido mais recente.</p>
        </div>
        <button
          type="button"
          className="button button--secondary"
          disabled={exportCustomers.isPending}
          onClick={() => exportCustomers.mutate(filters)}
        >
          <Download size={18} aria-hidden="true" />
          {exportCustomers.isPending ? 'Exportando…' : 'Exportar CSV'}
        </button>
      </header>
      {exportCustomers.isError ? (
        <p className="admin-form-error" role="alert">
          {exportCustomers.error.message}
        </p>
      ) : null}

      <form
        key={params.toString()}
        className="admin-filters"
        role="search"
        aria-label="Filtrar clientes"
        onSubmit={applyFilters}
      >
        <div className="field admin-filters__search">
          <label htmlFor="customers-q">Buscar</label>
          <input
            id="customers-q"
            name="q"
            placeholder="Nome, CPF ou telefone"
            defaultValue={filters.q ?? ''}
          />
        </div>
        <div className="field">
          <label htmlFor="customers-purchase">Compras</label>
          <select id="customers-purchase" name="compra" defaultValue={filters.purchase ?? ''}>
            <option value="">Todos</option>
            <option value="paid">Com compra paga</option>
            <option value="unpaid">Sem compra paga</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="customers-from">Último pedido de</label>
          <input id="customers-from" name="de" type="date" defaultValue={filters.from ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="customers-to">Até</label>
          <input id="customers-to" name="ate" type="date" defaultValue={filters.to ?? ''} />
        </div>
        <div className="admin-filters__actions">
          <button type="submit" className="button button--primary">
            <Search size={18} aria-hidden="true" />
            Filtrar
          </button>
          <button type="button" className="button button--secondary" onClick={() => setParams({})}>
            Limpar
          </button>
        </div>
      </form>

      <DataTable
        caption="Clientes"
        columns={columns}
        rows={customers.data?.customers}
        rowKey={(customer) => customer.cpf}
        loading={customers.isPending}
        error={customers.isError ? customers.error.message : null}
        onRetry={() => void customers.refetch()}
        emptyMessage="Nenhum cliente encontrado com esses filtros."
      />
      {customers.data && customers.data.total > 0 ? (
        <Pagination
          page={page}
          pageSize={customers.data.pageSize}
          total={customers.data.total}
          onChange={goToPage}
        />
      ) : null}
    </section>
  )
}
