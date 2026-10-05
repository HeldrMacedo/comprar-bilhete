import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DrawCountdown } from './DrawCountdown'

describe('DrawCountdown', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('atualiza a cada segundo e para em zero no horário do sorteio', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-07T22:59:58.000Z'))

    render(<DrawCountdown drawDate="2026-10-07T23:00:00.000Z" />)

    expect(screen.getByRole('timer')).toHaveTextContent('0d 00h 00min 02s')
    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getByRole('timer')).toHaveTextContent('0d 00h 00min 01s')
    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getByRole('timer')).toHaveTextContent('Sorteio iniciado')
  })

  it('usa dias e horas corretos quando o sorteio está distante', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-05T23:00:00.000Z'))

    render(<DrawCountdown drawDate="2026-10-07T23:00:00.000Z" />)

    expect(screen.getByRole('timer')).toHaveTextContent('2d 00h 00min 00s')
  })
})
