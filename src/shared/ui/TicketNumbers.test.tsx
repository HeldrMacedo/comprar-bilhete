import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TicketNumbers } from './TicketNumbers'

afterEach(cleanup)

describe('TicketNumbers', () => {
  it('mostra as dezenas da primeira e da segunda chance', () => {
    render(<TicketNumbers cardCode="#001" numbers={[3, 16]} secondChanceNumbers={[6, 59]} />)

    expect(screen.getByText('1ª chance')).toBeVisible()
    expect(screen.getByText('2ª chance')).toBeVisible()
    expect(screen.getByLabelText('Dezenas do bilhete #001 (1ª chance)')).toHaveTextContent('0316')
    expect(screen.getByLabelText('Dezenas do bilhete #001 (2ª chance)')).toHaveTextContent('0659')
  })

  it('mostra só as dezenas quando não há segunda chance', () => {
    render(<TicketNumbers cardCode="#001" numbers={[3, 16]} />)

    expect(screen.getByLabelText('Dezenas do bilhete #001')).toHaveTextContent('0316')
    expect(screen.queryByText('1ª chance')).toBeNull()
  })
})
