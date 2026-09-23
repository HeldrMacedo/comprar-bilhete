import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CartProvider } from './CartProvider'
import { useCart } from './cart-context'
import type { Raffle } from '../../raffle/domain/types'

const raffle: Raffle = {
  id: 'raffle-1',
  title: 'Sorteio',
  description: 'Teste',
  prize: 'Premio',
  drawDate: '2026-09-30T21:00:00.000Z',
  priceInCents: 1000,
  cards: [],
}

function Harness() {
  const { cart, setSelection } = useCart()
  return (
    <>
      <button type="button" onClick={() => setSelection(raffle, { mode: 'random', quantity: 3 })}>
        Selecionar 3 cartelas
      </button>
      <output data-testid="cart">{JSON.stringify(cart)}</output>
    </>
  )
}

describe('CartProvider', () => {
  it('stores random quantity without ticket ids', async () => {
    const user = userEvent.setup()
    render(
      <CartProvider>
        <Harness />
      </CartProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Selecionar 3 cartelas' }))
    expect(screen.getByTestId('cart')).toHaveTextContent(
      JSON.stringify({
        raffleId: 'raffle-1',
        raffleTitle: 'Sorteio',
        priceInCents: 1000,
        selection: { mode: 'random', quantity: 3 },
      }),
    )
  })
})
