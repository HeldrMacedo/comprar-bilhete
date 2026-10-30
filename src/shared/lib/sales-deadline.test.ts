import { describe, expect, it } from 'vitest'
import { salesDeadlineMessage } from './sales-deadline'

describe('salesDeadlineMessage', () => {
  it('mostra a data do servidor no fuso de Fortaleza', () => {
    expect(salesDeadlineMessage('2026-09-27T22:00:00.000Z')).toBe(
      'Pague até 27/09/2026, 19:00 (horário de Fortaleza). O código Pix vale por 72 horas, mas pagamento recebido depois do fim das vendas do concurso não valida o bilhete: ele fica como não validado e o valor é estornado.',
    )
  })

  it('usa texto sem data quando o concurso não informa o fim das vendas', () => {
    expect(salesDeadlineMessage(undefined)).toMatch(/^Pague antes do fim das vendas do concurso\./)
  })
})
