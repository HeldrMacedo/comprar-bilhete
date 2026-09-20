import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="container empty-cart page-section">
      <div className="empty-cart__icon" aria-hidden="true">
        404
      </div>
      <h1>Página não encontrada</h1>
      <p>O endereço acessado não existe ou foi movido.</p>
      <Link className="button button--primary" to="/">
        Voltar ao início
      </Link>
    </section>
  )
}
