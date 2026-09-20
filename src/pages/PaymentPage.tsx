import { useQuery } from '@tanstack/react-query'
import { Check, Clock3, ExternalLink, House, RotateCw, XCircle } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCart } from '../features/cart/runtime/cart-context'
import { checkoutRepository } from '../features/checkout/repository/checkout-repository'
import { ErrorState } from '../shared/ui/ErrorState'

export function PaymentPage() {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('order_nsu')
  const { clearCart } = useCart()
  const orderQuery = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => checkoutRepository.getOrder(orderId!),
    enabled: Boolean(orderId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'pending' || status === 'processing') return 2_500
      if (status === 'manual_review') return 10_000
      return false
    },
  })

  useEffect(() => {
    if (orderQuery.data?.status === 'paid') clearCart()
  }, [clearCart, orderQuery.data?.status])

  if (!orderId) {
    return (
      <div className="container page-section">
        <ErrorState message="O identificador do pedido não foi informado." />
      </div>
    )
  }

  if (orderQuery.isError) {
    return (
      <div className="container page-section">
        <ErrorState message={orderQuery.error.message} onRetry={() => void orderQuery.refetch()} />
      </div>
    )
  }

  const order = orderQuery.data
  if (order?.status === 'paid') {
    return (
      <section className="container payment-state page-section">
        <div className="payment-icon payment-icon--success">
          <Check size={42} />
        </div>
        <span className="eyebrow">
          <span /> Pagamento confirmado
        </span>
        <h1>Pronto! Suas cartelas estão garantidas.</h1>
        <p>
          O pedido <strong>{order.id}</strong> foi pago e registrado. Guarde o número para consulta.
        </p>
        {order.receiptUrl ? (
          <a
            className="button button--secondary"
            href={order.receiptUrl}
            target="_blank"
            rel="noreferrer"
          >
            Ver comprovante <ExternalLink size={17} />
          </a>
        ) : null}
        <Link className="button button--primary" to="/">
          <House size={18} /> Voltar ao início
        </Link>
      </section>
    )
  }

  if (order?.status === 'expired' || order?.status === 'cancelled') {
    return (
      <section className="container payment-state page-section">
        <div className="payment-icon payment-icon--danger">
          <XCircle size={42} />
        </div>
        <h1>Este pagamento não foi concluído</h1>
        <p>O pedido expirou ou foi cancelado. Suas cartelas não foram cobradas.</p>
        <Link className="button button--primary" to="/carrinho">
          Tentar novamente
        </Link>
      </section>
    )
  }

  const isConfirmingTickets = order?.status === 'processing' || order?.status === 'manual_review'

  return (
    <section className="container payment-state page-section">
      <div className="payment-icon payment-icon--waiting">
        <Clock3 size={40} />
      </div>
      <span className="eyebrow">
        <span /> {isConfirmingTickets ? 'Pagamento recebido' : 'Aguardando confirmação'}
      </span>
      <h1>
        {isConfirmingTickets ? 'Estamos confirmando suas cartelas' : 'Estamos conferindo seu Pix'}
      </h1>
      <p>
        {isConfirmingTickets
          ? 'O pagamento foi identificado. A compra só será concluída quando todas as cartelas forem validadas.'
          : 'Assim que a InfinitePay confirmar o pagamento, esta página será atualizada automaticamente.'}
      </p>
      <div className="order-reference">
        <span>Pedido</span>
        <strong>{orderId}</strong>
      </div>
      <button
        className="button button--secondary"
        type="button"
        disabled={orderQuery.isFetching}
        onClick={() => void orderQuery.refetch()}
      >
        <RotateCw size={17} className={orderQuery.isFetching ? 'spin' : ''} /> Verificar agora
      </button>
      {searchParams.get('demo') === 'true' ? (
        <small className="demo-note">
          Modo demonstração: a confirmação ocorre após alguns segundos.
        </small>
      ) : null}
    </section>
  )
}
