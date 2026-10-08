import { AlertTriangle, CalendarClock, Clock, Ticket, Users, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAdminDashboard } from '../../features/admin/runtime/admin-queries'
import { formatCompactCurrency, shortDay } from '../../features/admin/service/chart-scale'
import { orderStatusLabels } from '../../features/admin/service/order-labels'
import { BarList } from '../../features/admin/ui/BarList'
import { ColumnChart } from '../../features/admin/ui/ColumnChart'
import { StatCard } from '../../features/admin/ui/StatCard'
import { formatCurrency } from '../../shared/lib/currency'
import { formatDateTime, formatDrawDate, formatWeekday } from '../../shared/lib/date'
import { ErrorState } from '../../shared/ui/ErrorState'
import { Spinner } from '../../shared/ui/Spinner'

const numberFormatter = new Intl.NumberFormat('pt-BR')

function plural(count: number, singular: string, pluralForm: string) {
  return `${numberFormatter.format(count)} ${count === 1 ? singular : pluralForm}`
}

export function AdminHomePage() {
  const dashboard = useAdminDashboard()

  if (dashboard.isPending) {
    return (
      <div className="admin-center">
        <Spinner label="Carregando indicadores" />
      </div>
    )
  }
  if (dashboard.isError) {
    return <ErrorState message={dashboard.error.message} onRetry={() => void dashboard.refetch()} />
  }

  const { totals, dailySales, ordersByStatus, ticketsByRaffle, upcomingRaffles } = dashboard.data
  const last30Revenue = dailySales.reduce((sum, day) => sum + day.revenueInCents, 0)
  const last30Tickets = dailySales.reduce((sum, day) => sum + day.tickets, 0)

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>Dashboard</h1>
          <p>Atualizado em {formatDateTime(dashboard.data.generatedAt)}. Atualiza a cada minuto.</p>
        </div>
      </header>

      {totals.manualReviewOrders > 0 ? (
        <Link className="admin-alert" to="/admin/vendas?status=manual_review">
          <AlertTriangle size={18} aria-hidden="true" />
          {plural(totals.manualReviewOrders, 'pedido pago está', 'pedidos pagos estão')} em análise,
          com entrega de bilhetes pendente. Ver pedidos
        </Link>
      ) : null}

      <div className="admin-stats">
        <StatCard
          label="Clientes"
          value={numberFormatter.format(totals.customers)}
          detail="CPFs com pedido no site"
          icon={Users}
        />
        <StatCard
          label="Bilhetes vendidos"
          value={numberFormatter.format(totals.paidTickets)}
          detail={plural(totals.paidOrders, 'pedido pago', 'pedidos pagos')}
          icon={Ticket}
          tone="success"
        />
        <StatCard
          label="Faturamento total"
          value={formatCurrency(totals.revenueInCents)}
          detail={`${formatCurrency(last30Revenue)} nos últimos 30 dias`}
          icon={Wallet}
          tone="success"
        />
        <StatCard
          label="Bilhetes pendentes de pagamento"
          value={numberFormatter.format(totals.pendingTickets)}
          detail={plural(totals.pendingOrders, 'pedido aguardando', 'pedidos aguardando')}
          icon={Clock}
          tone="warning"
        />
      </div>

      <section className="admin-panel" aria-labelledby="upcoming-title">
        <h2 id="upcoming-title">Próximos sorteios</h2>
        {upcomingRaffles === null ? (
          <p className="admin-form-error" role="alert">
            {dashboard.data.upcomingRafflesError}
          </p>
        ) : upcomingRaffles.length === 0 ? (
          <p className="admin-hint">Nenhum sorteio ativo no momento.</p>
        ) : (
          <div className="admin-raffles">
            {upcomingRaffles.map((raffle) => (
              <article key={raffle.id} className="admin-raffle">
                <header>
                  <CalendarClock size={18} aria-hidden="true" />
                  <div>
                    <h3>{raffle.title}</h3>
                    <p>
                      <span className="admin-raffle__weekday">
                        {formatWeekday(raffle.drawDate)}
                      </span>
                      , {formatDrawDate(raffle.drawDate)}
                    </p>
                  </div>
                </header>
                <dl>
                  <div>
                    <dt>Bilhete</dt>
                    <dd>{formatCurrency(raffle.priceInCents)}</dd>
                  </div>
                  <div>
                    <dt>Vendidos no site</dt>
                    <dd>{numberFormatter.format(raffle.paidTickets)}</dd>
                  </div>
                  <div>
                    <dt>Arrecadado</dt>
                    <dd>{formatCurrency(raffle.revenueInCents)}</dd>
                  </div>
                  {raffle.salesEndAt ? (
                    <div>
                      <dt>Vendas até</dt>
                      <dd>{formatDrawDate(raffle.salesEndAt)}</dd>
                    </div>
                  ) : null}
                </dl>
                {raffle.prizes.length ? (
                  <ol className="admin-raffle__prizes" aria-label={`Prêmios de ${raffle.title}`}>
                    {raffle.prizes.map((prize, index) => (
                      <li key={`${index}-${prize}`}>{prize}</li>
                    ))}
                  </ol>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="admin-charts">
        <section className="admin-panel admin-panel--wide" aria-labelledby="revenue-title">
          <h2 id="revenue-title">Faturamento por dia</h2>
          <p className="admin-hint">
            Últimos 30 dias, pela data de confirmação do pagamento ·{' '}
            {plural(last30Tickets, 'bilhete', 'bilhetes')}
          </p>
          <ColumnChart
            title="Faturamento por dia nos últimos 30 dias"
            data={dailySales.map((day) => ({
              label: shortDay(day.day),
              value: day.revenueInCents,
            }))}
            formatValue={formatCurrency}
            formatAxis={formatCompactCurrency}
            labelEvery={6}
            emptyMessage="Nenhum pagamento confirmado nos últimos 30 dias."
          />
        </section>

        <section className="admin-panel" aria-labelledby="raffle-sales-title">
          <h2 id="raffle-sales-title">Bilhetes vendidos por sorteio</h2>
          <BarList
            title="Bilhetes vendidos por sorteio"
            data={ticketsByRaffle.map((raffle) => ({
              key: raffle.raffleId,
              label: raffle.raffleTitle,
              value: raffle.tickets,
              detail: formatCurrency(raffle.revenueInCents),
            }))}
            formatValue={(value) => numberFormatter.format(value)}
            emptyMessage="Nenhum bilhete vendido ainda."
          />
        </section>

        <section className="admin-panel" aria-labelledby="status-title">
          <h2 id="status-title">Pedidos por status</h2>
          <BarList
            title="Pedidos por status"
            data={ordersByStatus
              .filter((row) => row.orders > 0)
              .map((row) => ({
                key: row.status,
                label: orderStatusLabels[row.status],
                value: row.orders,
              }))}
            formatValue={(value) => numberFormatter.format(value)}
            emptyMessage="Nenhum pedido ainda."
          />
        </section>
      </div>
    </section>
  )
}
