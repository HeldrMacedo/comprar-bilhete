import type { Order } from '../orders/order-types.js'

export type TicketCardPrize = { title?: string; first: string[][]; second: string[][] }
export type TicketCard = {
  title: string
  raffleTitle: string
  drawDate?: string
  prizes: TicketCardPrize[]
  luckySpins?: { count: number; label: string }
  price: string
  batch?: string
}
export type TicketCardDocument = {
  customerName: string
  // Titular que aparece no bilhete: o beneficiário, em compra para terceiros.
  holderName: string
  customerCity?: string
  maskedCpf: string
  totalPaid: string
  paidAt?: string
  myTicketsUrl: string
  orderShortId: string
  cards: TicketCard[]
}

// Cópia do comprovante do navegador (src/features/purchases/service/receipt.ts); um teste
// garante que os textos não divergem.
export const SOL_DA_SORTE_HEADER = [
  'SOL DA SORTE',
  'SLB - Sistema Lotérico da Bahia',
  'Av. Orlando Oliveira Pires, 266A',
  'Centro - Jacobina - Bahia',
] as const

export const PRIZE_FOOTER = [
  'Parabéns, sua compra foi realizada com sucesso!',
  '',
  'Atenção: Em caso de premiação, favor encaminhar os seguintes documentos para o recebimento e/ou retirada do prêmio:',
  '',
  '• Documentação pessoal',
  '• Comprovante de endereço',
  '',
  'Ganhadores fora da Região Norte da Bahia, a retirada do prêmio deverá acontecer na sede do Sol da Sorte, em Jacobina, ou em uma de nossas representantes.',
] as const

const timeZone = 'America/Fortaleza'
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone,
})
const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone,
})
const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function buildTicketCards(order: Order, appUrl: string): TicketCardDocument {
  const { customer } = order
  const city = customer.address?.city
  return {
    customerName: customer.name,
    holderName: customer.beneficiaryName ?? customer.name,
    ...(city ? { customerCity: city } : {}),
    maskedCpf: `***.${customer.cpf.slice(3, 6)}.${customer.cpf.slice(6, 9)}-**`,
    totalPaid: formatCents(order.paidAmountInCents ?? order.totalInCents),
    ...(order.paidAt ? { paidAt: formatDateTime(order.paidAt) } : {}),
    myTicketsUrl: new URL('/minhas-compras', appUrl).toString(),
    orderShortId: order.id.slice(0, 8),
    cards: order.items.map((item) => {
      const first = toRows(item.numbers)
      const second = toRows(item.secondChanceNumbers ?? [])
      const prizes: TicketCardPrize[] = item.prizes?.length
        ? item.prizes.map((title) => ({ title, first, second }))
        : [{ first, second }]
      return {
        title: `BILHETE ${item.identification ?? item.code}`,
        raffleTitle: item.raffleTitle ?? order.raffleTitle,
        ...(item.drawDate ? { drawDate: dateFormatter.format(new Date(item.drawDate)) } : {}),
        prizes,
        ...(item.luckySpins ? { luckySpins: item.luckySpins } : {}),
        price: formatCents(item.unitPriceInCents ?? order.unitPriceInCents),
        ...(item.validationBatch
          ? {
              batch: `LOTE: ${item.validationBatch}   POSIÇÃO: ${item.batchPosition ?? '—'}`,
            }
          : {}),
      }
    }),
  }
}

function toRows(numbers: number[]) {
  const rows: string[][] = []
  for (let index = 0; index < numbers.length; index += 5) {
    rows.push(numbers.slice(index, index + 5).map((number) => String(number).padStart(2, '0')))
  }
  return rows
}

function formatCents(cents: number) {
  return currencyFormatter.format(cents / 100)
}

function formatDateTime(iso: string) {
  const date = new Date(iso)
  return `${dateFormatter.format(date)} ${timeFormatter.format(date)}`
}
