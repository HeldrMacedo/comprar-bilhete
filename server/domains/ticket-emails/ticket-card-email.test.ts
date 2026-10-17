import { describe, expect, it } from 'vitest'
import type { TicketCardDocument } from './ticket-card.js'
import { renderTicketCardEmail } from './ticket-card-email.js'

const document: TicketCardDocument = {
  customerName: 'Maria <script>alert(1)</script>',
  holderName: 'Maria <script>alert(1)</script>',
  customerCity: 'NATAL',
  maskedCpf: '***.950.174-**',
  totalPaid: 'R$ 10,00',
  paidAt: '17/10/2026 14:32',
  myTicketsUrl: 'https://soldasorte.example/minhas-compras',
  orderShortId: 'abcd1234',
  cards: [
    {
      title: 'BILHETE 60410080001-00',
      raffleTitle: 'Sorteio de Setembro',
      drawDate: '25/10/2026',
      prizes: [
        {
          title: '1 AVELLOZ AZ1',
          first: [['03', '11', '27', '38', '45']],
          second: [['02', '09', '14', '33', '50']],
        },
      ],
      luckySpins: { count: 5, label: 'Giros no domingo' },
      price: 'R$ 10,00',
      batch: 'LOTE: 77   POSIÇÃO: 3',
    },
  ],
}

describe('renderTicketCardEmail', () => {
  it('monta assunto, cartela em HTML e link para Meus bilhetes', () => {
    const email = renderTicketCardEmail(document)
    expect(email.subject).toBe('Seus bilhetes Sol da Sorte — pagamento confirmado')
    expect(email.html).toContain('BILHETE 60410080001-00')
    expect(email.html).toContain('1 AVELLOZ AZ1')
    expect(email.html).toContain('1ª CHANCE')
    expect(email.html).toContain('2ª CHANCE')
    expect(email.html).toContain('>45</td>')
    expect(email.html).toContain('5 GIROS DA SORTE')
    expect(email.html).toContain('href="https://soldasorte.example/minhas-compras"')
  })

  it('escapa texto vindo do pedido e não leva CPF', () => {
    const email = renderTicketCardEmail(document)
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('Maria &lt;script&gt;')
    expect(email.html).not.toContain('950.174')
    expect(email.text).not.toContain('950.174')
  })

  it('versão em texto traz as dezenas em linhas de 5', () => {
    const { text } = renderTicketCardEmail(document)
    expect(text).toContain('BILHETE 60410080001-00')
    expect(text).toContain('1ª CHANCE: 03-11-27-38-45')
    expect(text).toContain('2ª CHANCE: 02-09-14-33-50')
    expect(text).toContain('https://soldasorte.example/minhas-compras')
  })

  it('sem 2ª chance não mostra o título da segunda grade', () => {
    const single = renderTicketCardEmail({
      ...document,
      cards: [{ ...document.cards[0]!, prizes: [{ first: [['01', '02']], second: [] }] }],
    })
    expect(single.html).not.toContain('2ª CHANCE')
    expect(single.text).not.toContain('2ª CHANCE')
  })

  it('limita o HTML a poucos KB e avisa dos bilhetes que ficaram só no PDF', () => {
    const rows = Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 5 }, (_, column) => String(row * 5 + column + 1).padStart(2, '0')),
    )
    const base = document.cards[0]!
    const cards = Array.from({ length: 10 }, (_, index) => ({
      ...base,
      title: `BILHETE 6041008${String(index).padStart(4, '0')}-00`,
      prizes: ['1º PRÊMIO', '2º PRÊMIO', '3º PRÊMIO', '4º PRÊMIO'].map((title) => ({
        title,
        first: rows,
        second: rows,
      })),
    }))
    const { html, text } = renderTicketCardEmail({ ...document, cards })
    const rendered = cards.filter((card) => html.includes(card.title)).length
    expect(html.length).toBeLessThan(100_000)
    expect(rendered).toBeGreaterThanOrEqual(1)
    expect(rendered).toBeLessThan(10)
    expect(html).toContain(`E mais ${10 - rendered} bilhetes no PDF em anexo e em`)
    expect(html).toContain('href="https://soldasorte.example/minhas-compras"')
    for (const card of cards) expect(text).toContain(card.title)
  })

  it('usa o singular quando só um bilhete fica de fora e não avisa quando todos cabem', () => {
    const rows = Array.from({ length: 4 }, () => ['01', '02', '03', '04', '05'])
    const cardsOf = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        ...document.cards[0]!,
        title: `BILHETE ${index}`,
        prizes: Array.from({ length: 4 }, () => ({ first: rows, second: rows })),
      }))
    expect(renderTicketCardEmail(document).html).not.toContain('E mais')
    const html = (count: number) =>
      renderTicketCardEmail({ ...document, cards: cardsOf(count) }).html
    const fits = Array.from({ length: 12 }, (_, index) => index + 1).filter(
      (count) => !html(count).includes('E mais'),
    )
    const last = Math.max(...fits)
    expect(last).toBeLessThan(12)
    expect(html(last + 1)).toContain('E mais 1 bilhete no PDF em anexo')
  })
})
