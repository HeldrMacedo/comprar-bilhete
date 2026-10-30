import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { existingMaria, order, ticket } from '../orders/order-test-fixtures.js'
import { PRIZE_FOOTER, SOL_DA_SORTE_HEADER, buildTicketCards } from './ticket-card.js'

const fullTicket = {
  ...ticket('card-001'),
  code: '#001',
  identification: '60410080001-00',
  numbers: [3, 11, 27, 38, 45, 50, 61, 72, 80, 90],
  secondChanceNumbers: [2, 9, 14, 33, 50, 51, 52, 53, 54, 55],
  drawDate: '2026-10-25T18:00:00.000Z',
  prizes: ['1 AVELLOZ AZ1', '1 HONDA START 160'],
  luckySpins: { count: 5, label: 'Giros no domingo' },
  unitPriceInCents: 1000,
  validationBatch: '77',
  batchPosition: 3,
}

describe('buildTicketCards', () => {
  it('monta uma cartela por bilhete com as duas grades sob cada prêmio', () => {
    const document = buildTicketCards(
      order({
        items: [fullTicket],
        customer: {
          ...existingMaria,
          cpf: '08395017499',
          address: {
            zipCode: '59000000',
            street: 'RUA A',
            number: '1',
            neighborhood: 'CENTRO',
            city: 'NATAL',
            state: 'RN',
          },
        },
        paidAt: '2026-10-17T17:32:00.000Z',
      }),
      'https://soldasorte.example/',
    )

    expect(document).toMatchObject({
      customerName: 'Maria da Silva',
      customerCity: 'NATAL',
      maskedCpf: '***.950.174-**',
      paidAt: '17/10/2026 14:32',
      myTicketsUrl: 'https://soldasorte.example/minhas-compras',
      orderShortId: '00000000',
    })
    expect(document.totalPaid.replace(/\s/g, ' ')).toBe('R$ 10,00')
    const [card] = document.cards
    expect(card).toMatchObject({
      title: 'BILHETE 60410080001-00',
      raffleTitle: 'Sorteio de Setembro',
      drawDate: '25/10/2026',
      luckySpins: { count: 5, label: 'Giros no domingo' },
      batch: 'LOTE: 77   POSIÇÃO: 3',
    })
    expect(card!.prizes).toEqual([
      {
        title: '1 AVELLOZ AZ1',
        first: [
          ['03', '11', '27', '38', '45'],
          ['50', '61', '72', '80', '90'],
        ],
        second: [
          ['02', '09', '14', '33', '50'],
          ['51', '52', '53', '54', '55'],
        ],
      },
      expect.objectContaining({ title: '1 HONDA START 160' }),
    ])
  })

  it('sem identificação usa o número; sem prêmios mostra uma grade sem título', () => {
    const document = buildTicketCards(order(), 'http://localhost:5173')
    expect(document.cards[0]).toMatchObject({
      title: 'BILHETE card-001',
      prizes: [{ first: [['01', '02', '03', '04', '05']], second: [] }],
    })
    expect(document.cards[0]!.prizes[0]).not.toHaveProperty('title')
  })

  it('usa o mesmo cabeçalho e rodapé do comprovante do navegador', () => {
    const receipt = readFileSync('src/features/purchases/service/receipt.ts', 'utf8')
    for (const line of [...SOL_DA_SORTE_HEADER, ...PRIZE_FOOTER].filter(Boolean)) {
      expect(receipt).toContain(line)
    }
  })

  it('titular é o beneficiário em compra para terceiros e o comprador nos demais casos', () => {
    const own = buildTicketCards(order({ items: [fullTicket] }), 'https://soldasorte.example/')
    expect(own.holderName).toBe(existingMaria.name)
    const gift = buildTicketCards(
      order({
        items: [fullTicket],
        customer: { ...existingMaria, beneficiaryName: 'Ana Beneficiária' },
      }),
      'https://soldasorte.example/',
    )
    expect(gift).toMatchObject({ customerName: existingMaria.name, holderName: 'Ana Beneficiária' })
  })

  it('não gera cartela para bilhete não validado', () => {
    const document = buildTicketCards(
      order({
        items: [
          { ...ticket('card-001'), validationStatus: 'not_validated' },
          { ...ticket('card-002'), identification: 'X-2' },
        ],
      }),
      'https://soldasorte.example/',
    )
    expect(document.cards).toHaveLength(1)
    expect(document.cards[0]?.title).toBe('BILHETE X-2')
  })
})
