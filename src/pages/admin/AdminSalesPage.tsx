import { Check, Download, Search, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AdminOrder, OrderAction } from '../../features/admin/domain/types'
import {
  useAdminOrders,
  useExportOrders,
  useOrderAction,
} from '../../features/admin/runtime/admin-queries'
import {
  readPage,
  readSalesFilters,
  toSearchParams,
} from '../../features/admin/service/list-params'
import {
  canApprove,
  canCancel,
  describeCaptureMethod,
  orderStatusLabels,
  orderStatusTones,
} from '../../features/admin/service/order-labels'
import { DataTable, type Column } from '../../features/admin/ui/DataTable'
import { OrderActionDialog } from '../../features/admin/ui/OrderActionDialog'
import { Pagination } from '../../features/admin/ui/Pagination'
import { StatusBadge } from '../../features/admin/ui/StatusBadge'
import { formatCurrency } from '../../shared/lib/currency'
import { formatDateTime } from '../../shared/lib/date'
import { formatCpf, formatPhone } from '../../shared/lib/forms'

function describeOutcome(order: AdminOrder) {
  if (order.status === 'paid') {
    return { tone: 'success' as const, text: 'Pedido aprovado e bilhetes validados.' }
  }
  if (order.status === 'cancelled') return { tone: 'success' as const, text: 'Pedido cancelado.' }
  return {
    tone: 'error' as const,
    text: `A entrega dos bilhetes falhou e o pedido continua em análise${
      order.lastError ? `: ${order.lastError}` : '.'
    }`,
  }
}

export function AdminSalesPage() {
  const [params, setParams] = useSearchParams()
  const filters = readSalesFilters(params)
  const page = readPage(params)
  const orders = useAdminOrders(filters, page)
  const exportOrders = useExportOrders()
  const orderAction = useOrderAction()
  const [target, setTarget] = useState<{ order: AdminOrder; action: OrderAction } | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

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
        status: value('status'),
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

  function openAction(order: AdminOrder, action: OrderAction) {
    orderAction.reset()
    setNotice(null)
    setTarget({ order, action })
  }

  const columns: Column<AdminOrder>[] = [
    { key: 'createdAt', header: 'Data', render: (order) => formatDateTime(order.createdAt) },
    {
      key: 'customer',
      header: 'Cliente',
      render: (order) => (
        <div className="admin-cell-stack">
          <strong>{order.customer.name}</strong>
          <span>{formatCpf(order.customer.cpf)}</span>
          <span>{formatPhone(order.customer.phone)}</span>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Bilhetes',
      render: (order) => (
        <div className="admin-cell-stack">
          {[...new Set(order.items.map((item) => item.raffleTitle))].map((title) => (
            <span key={title}>
              {title}:{' '}
              {order.items
                .filter((item) => item.raffleTitle === title)
                .map((item) => item.code)
                .join(', ')}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'end',
      render: (order) => formatCurrency(order.totalInCents),
    },
    {
      key: 'status',
      header: 'Status',
      render: (order) => (
        <div className="admin-cell-stack">
          <StatusBadge tone={orderStatusTones[order.status]}>
            {orderStatusLabels[order.status]}
          </StatusBadge>
          {order.status === 'paid' ? (
            <span>{describeCaptureMethod(order.captureMethod)}</span>
          ) : null}
          {order.lastError && order.status === 'manual_review' ? (
            <span className="admin-cell-error">{order.lastError}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Ações',
      align: 'end',
      render: (order) =>
        canApprove(order) || canCancel(order) ? (
          <div className="admin-row-actions">
            {canApprove(order) ? (
              <button
                type="button"
                className="admin-icon-button admin-icon-button--success"
                aria-label={`Aprovar pedido de ${order.customer.name}`}
                title="Aprovar"
                onClick={() => openAction(order, 'approve')}
              >
                <Check size={16} aria-hidden="true" />
              </button>
            ) : null}
            {canCancel(order) ? (
              <button
                type="button"
                className="admin-icon-button admin-icon-button--danger"
                aria-label={`Cancelar pedido de ${order.customer.name}`}
                title="Cancelar"
                onClick={() => openAction(order, 'cancel')}
              >
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : (
          <span className="admin-hint">—</span>
        ),
    },
  ]

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>Vendas</h1>
          <p>Pedidos feitos no site, do mais recente ao mais antigo.</p>
        </div>
        <button
          type="button"
          className="button button--secondary"
          disabled={exportOrders.isPending}
          onClick={() => exportOrders.mutate(filters)}
        >
          <Download size={18} aria-hidden="true" />
          {exportOrders.isPending ? 'Exportando…' : 'Exportar CSV'}
        </button>
      </header>
      {notice ? (
        <p
          className={notice.tone === 'success' ? 'admin-notice' : 'admin-form-error'}
          role="status"
        >
          {notice.text}
        </p>
      ) : null}
      {exportOrders.isError ? (
        <p className="admin-form-error" role="alert">
          {exportOrders.error.message}
        </p>
      ) : null}

      <form
        key={params.toString()}
        className="admin-filters"
        role="search"
        aria-label="Filtrar vendas"
        onSubmit={applyFilters}
      >
        <div className="field admin-filters__search">
          <label htmlFor="sales-q">Buscar</label>
          <input
            id="sales-q"
            name="q"
            placeholder="Nome, telefone, CPF ou código do bilhete"
            defaultValue={filters.q ?? ''}
          />
        </div>
        <div className="field">
          <label htmlFor="sales-status">Status</label>
          <select id="sales-status" name="status" defaultValue={filters.status ?? ''}>
            <option value="">Todos</option>
            {Object.entries(orderStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sales-from">De</label>
          <input id="sales-from" name="de" type="date" defaultValue={filters.from ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="sales-to">Até</label>
          <input id="sales-to" name="ate" type="date" defaultValue={filters.to ?? ''} />
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
        caption="Vendas"
        columns={columns}
        rows={orders.data?.orders}
        rowKey={(order) => order.id}
        loading={orders.isPending}
        error={orders.isError ? orders.error.message : null}
        onRetry={() => void orders.refetch()}
        emptyMessage="Nenhuma venda encontrada com esses filtros."
      />
      {orders.data && orders.data.total > 0 ? (
        <Pagination
          page={page}
          pageSize={orders.data.pageSize}
          total={orders.data.total}
          onChange={goToPage}
        />
      ) : null}

      <OrderActionDialog
        key={target ? `${target.order.id}-${target.action}` : 'closed'}
        order={target?.order ?? null}
        action={target?.action ?? 'approve'}
        pending={orderAction.isPending}
        error={orderAction.isError ? orderAction.error.message : null}
        onClose={() => setTarget(null)}
        onConfirm={(reason) => {
          if (!target) return
          orderAction.mutate(
            { orderId: target.order.id, action: target.action, reason },
            {
              onSuccess: (order) => {
                setTarget(null)
                setNotice(describeOutcome(order))
              },
            },
          )
        }}
      />
    </section>
  )
}
