import { describe, expect, it } from 'vitest'
import type { Purchase, PurchaseItem } from '../domain/types'
import { buildReceipt, type ReceiptLine } from './receipt'

const item: PurchaseItem = {
  id: '80001',
  code: '80001',
  numbers: [1, 7, 9, 12, 21, 24, 25, 30, 32, 36, 40, 54, 57, 58, 60],
  secondChanceNumbers: [1, 3, 4, 7, 19, 23, 29, 35, 47, 48, 54, 56, 57, 58, 60],
  raffleId: '2026038',
  raffleTitle: 'Sorteio Especial #2026038',
  unitPriceInCents: 600,
  identification: '60390093108-38',
  drawDate: '2026-09-20T12:00:00.000Z',
  prizes: ['1 AVELLOZ AZ1', '1 HONDA START 160 + 20 MIL'],
  luckySpins: { count: 10, label: 'R$ 300,00' },
  validationBatch: '84734',
  batchPosition: 12,
}

const purchase: Purchase = {
  id: '11111111-0000-4000-8000-000000000001',
  status: 'paid',
  totalInCents: 600,
  createdAt: '2026-09-16T20:55:00.000Z',
  paidAt: '2026-09-16T20:57:17.000Z',
  items: [item],
  customer: {
    name: 'JOAO JAILSON DA SILVA',
    city: 'Natal',
    phone: '84987175711',
    cpf: '52998224725',
  },
}

function texts(lines: ReceiptLine[]) {
  return lines.flatMap((line) =>
    line.kind === 'text'
      ? [line.text]
      : line.kind === 'columns'
        ? [`${line.left} | ${line.right}`]
        : [],
  )
}

describe('buildReceipt', () => {
  it('monta o comprovante da cartela com prêmios, duas chances, valores e cliente', () => {
    const lines = texts(buildReceipt(purchase, item))

    expect(lines.slice(0, 4)).toEqual([
      'SOL DA SORTE',
      'SLB - Sistema Lotérico da Bahia',
      'Av. Orlando Oliveira Pires, 266A',
      'Centro - Jacobina - Bahia',
    ])
    expect(lines).toContain('BILHETE 60390093108-38')
    expect(lines).toContain('SORTEIO: 20/09/2026')
    expect(lines).toContain('1ª Chance | 2ª Chance')
    const firstPrize = lines.indexOf('1 AVELLOZ AZ1')
    expect(lines.slice(firstPrize + 1, firstPrize + 4)).toEqual([
      '01-07-09-12-21 | 01-03-04-07-19',
      '24-25-30-32-36 | 23-29-35-47-48',
      '40-54-57-58-60 | 54-56-57-58-60',
    ])
    expect(lines).toContain('1 HONDA START 160 + 20 MIL')
    expect(lines).toEqual(
      expect.arrayContaining([
        '10 GIROS DA SORTE',
        'R$ 300,00',
        'VALOR DA DOAÇÃO: R$ 6,00',
        'QUANTIDADE: 1',
        'TOTAL A PAGAR: R$ 6,00',
        'VENDA: ONLINE',
        'LOTE: 84734   POSIÇÃO: 12',
        'DATA DA COMPRA: 16/09/2026 17:57',
        'DADOS DO CLIENTE',
        'NOME: JOAO JAILSON DA SILVA',
        'Natal',
        'FONE: 84987175711',
        'CPF: 529.982.247-25',
        'Parabéns, sua compra foi realizada com sucesso!',
        '• Documentação pessoal',
        '• Comprovante de endereço',
      ]),
    )
  })

  it('mostra só a primeira chance quando a cartela não tem segunda', () => {
    const lines = texts(
      buildReceipt(purchase, { ...item, secondChanceNumbers: [], numbers: [1, 2, 3] }),
    )

    expect(lines).toContain('1ª Chance | ')
    expect(lines).toContain('01-02-03 | ')
  })

  it('usa o número da cartela e um único bloco de dezenas em pedido antigo', () => {
    const legacy: PurchaseItem = {
      id: '80001',
      code: '80001',
      numbers: [1, 2, 3, 4, 5],
      raffleId: '2026038',
      raffleTitle: 'Sorteio Especial #2026038',
      unitPriceInCents: 600,
    }
    const lines = texts(buildReceipt({ ...purchase, items: [legacy], customer: undefined }, legacy))

    expect(lines).toContain('BILHETE 80001')
    expect(lines.filter((line) => line === '01-02-03-04-05 | ')).toHaveLength(1)
    expect(lines.some((line) => line.startsWith('SORTEIO'))).toBe(false)
    expect(lines.some((line) => line.includes('GIROS'))).toBe(false)
    expect(lines.some((line) => line.startsWith('LOTE'))).toBe(false)
    expect(lines).not.toContain('DADOS DO CLIENTE')
  })
})
