import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
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

const sundayRaffle: Raffle = {
  ...raffle,
  id: 'raffle-2',
  title: 'Domingo',
  priceInCents: 600,
}

function Harness() {
  const { cart, setSelections, itemCount, totalInCents } = useCart()
  return (
    <>
      <button
        type="button"
        onClick={() =>
          setSelections([
            { raffle, selection: { mode: 'random', quantity: 3 } },
            { raffle: sundayRaffle, selection: { mode: 'random', quantity: 1 } },
          ])
        }
      >
        Selecionar dois sorteios
      </button>
      <output data-testid="cart">{JSON.stringify(cart)}</output>
      <output data-testid="count">{itemCount}</output>
      <output data-testid="total">{totalInCents}</output>
    </>
  )
}

describe('CartProvider', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('recupera o carrinho anterior como seleção de um sorteio', () => {
    localStorage.setItem(
      'bilhete-da-sorte:cart:v2',
      JSON.stringify({
        raffleId: 'raffle-1',
        raffleTitle: 'Sorteio',
        priceInCents: 1000,
        selection: { mode: 'random', quantity: 2 },
      }),
    )
    render(
      <CartProvider>
        <Harness />
      </CartProvider>,
    )
    expect(screen.getByTestId('count')).toHaveTextContent('2')
    expect(screen.getByTestId('total')).toHaveTextContent('2000')
  })

  it('stores each raffle selection and sums prices without ticket ids', async () => {
    const user = userEvent.setup()
    render(
      <CartProvider>
        <Harness />
      </CartProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Selecionar dois sorteios' }))
    expect(screen.getByTestId('cart')).toHaveTextContent(
      JSON.stringify({
        entries: [
          {
            raffleId: 'raffle-1',
            raffleTitle: 'Sorteio',
            priceInCents: 1000,
            selection: { mode: 'random', quantity: 3 },
          },
          {
            raffleId: 'raffle-2',
            raffleTitle: 'Domingo',
            priceInCents: 600,
            selection: { mode: 'random', quantity: 1 },
          },
        ],
      }),
    )
    expect(screen.getByTestId('count')).toHaveTextContent('4')
    expect(screen.getByTestId('total')).toHaveTextContent('3600')
  })
})
