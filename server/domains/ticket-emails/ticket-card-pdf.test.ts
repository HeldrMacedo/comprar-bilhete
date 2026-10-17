import { describe, expect, it } from 'vitest'
import type { TicketCard, TicketCardDocument } from './ticket-card.js'
import { renderTicketCardsPdf } from './ticket-card-pdf.js'

const rows = [
  ['01', '02', '03', '04', '05'],
  ['06', '07', '08', '09', '10'],
  ['11', '12', '13', '14', '15'],
  ['16', '17', '18', '19', '20'],
]
const card: TicketCard = {
  title: 'BILHETE 60410080001-00',
  raffleTitle: 'Sorteio de Setembro',
  drawDate: '25/10/2026',
  prizes: ['1º PRÊMIO', '2º PRÊMIO', '3º PRÊMIO', '4º PRÊMIO'].map((title) => ({
    title,
    first: rows,
    second: rows,
  })),
  luckySpins: { count: 5, label: 'Giros no domingo' },
  price: 'R$ 10,00',
  batch: 'LOTE: 77   POSIÇÃO: 3',
}
const document: TicketCardDocument = {
  customerName: 'Maria da Silva',
  holderName: 'Maria da Silva',
  customerCity: 'NATAL',
  maskedCpf: '***.950.174-**',
  totalPaid: 'R$ 20,00',
  paidAt: '17/10/2026 14:32',
  myTicketsUrl: 'https://soldasorte.example/minhas-compras',
  orderShortId: 'abcd1234',
  cards: [card, { ...card, title: 'BILHETE 60410080002-00' }],
}

function pageCount(pdf: Buffer) {
  return pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g)?.length ?? 0
}

describe('renderTicketCardsPdf', () => {
  it('gera PDF com cada bilhete começando em página nova', async () => {
    const pdf = await renderTicketCardsPdf(document)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pageCount(pdf)).toBe(2)
  })

  it('bilhete pequeno ocupa uma página só', async () => {
    const small = await renderTicketCardsPdf({
      ...document,
      cards: [{ ...card, prizes: [{ first: [rows[0]!], second: [] }] }],
    })
    expect(pageCount(small)).toBe(1)
  })

  it('bilhete com 5 prêmios de 20+20 dezenas cabe em uma página', async () => {
    const five = await renderTicketCardsPdf({
      ...document,
      cards: [
        {
          ...card,
          prizes: ['1º', '2º', '3º', '4º', '5º'].map((title) => ({
            title: `${title} PRÊMIO`,
            first: rows,
            second: rows,
          })),
        },
      ],
    })
    expect(pageCount(five)).toBe(1)
  })
})
