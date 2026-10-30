import { describe, expect, it } from 'vitest'
import type { AdminOrder } from '../domain/types'
import { canApprove, canCancel, orderStatusLabels, orderStatusTones } from './order-labels'

const order = { status: 'not_validated' } as Pick<AdminOrder, 'status'> as AdminOrder

describe('pedido não validado', () => {
  it('tem rótulo e tom de alerta', () => {
    expect(orderStatusLabels.not_validated).toBe('Não validado')
    expect(orderStatusTones.not_validated).toBe('warning')
  })

  it('não pode ser aprovado nem cancelado pelo painel', () => {
    expect(canApprove(order)).toBe(false)
    expect(canCancel(order)).toBe(false)
  })
})
