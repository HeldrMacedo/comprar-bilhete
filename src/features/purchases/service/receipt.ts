import { formatCurrency } from '../../../shared/lib/currency'
import { formatCpf } from '../../../shared/lib/forms'
import type { Purchase, PurchaseItem } from '../domain/types'

export type ReceiptLine =
  | { kind: 'rule'; style: 'double' | 'single' }
  | { kind: 'text'; text: string; align: 'center' | 'left' }
  | { kind: 'columns'; left: string; right: string }
  | { kind: 'space' }

const header = [
  'SOL DA SORTE',
  'SLB - Sistema Lotérico da Bahia',
  'Av. Orlando Oliveira Pires, 266A',
  'Centro - Jacobina - Bahia',
]

const footer = [
  'Parabéns, sua compra foi realizada com sucesso!',
  '',
  'Atenção: Em caso de premiação, favor encaminhar os seguintes documentos para o recebimento e/ou retirada do prêmio:',
  '',
  '• Documentação pessoal',
  '• Comprovante de endereço',
]

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Fortaleza',
})

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Fortaleza',
})

const doubleRule: ReceiptLine = { kind: 'rule', style: 'double' }
const singleRule: ReceiptLine = { kind: 'rule', style: 'single' }
const space: ReceiptLine = { kind: 'space' }

// Comprovante de um bilhete no formato do bilhete impresso da Sol da Sorte.
export function buildReceipt(purchase: Purchase, item: PurchaseItem): ReceiptLine[] {
  const secondChance = item.secondChanceNumbers ?? []
  const lines: ReceiptLine[] = [doubleRule, ...header.map(center), singleRule]

  lines.push(center(`BILHETE ${item.identification ?? item.code}`))
  if (item.drawDate) lines.push(center(`SORTEIO: ${dateFormatter.format(new Date(item.drawDate))}`))
  lines.push(doubleRule, space)
  lines.push(columns('1ª Chance', secondChance.length ? '2ª Chance' : ''), singleRule)

  const prizes: Array<string | undefined> = item.prizes?.length ? item.prizes : [undefined]
  for (const prize of prizes) {
    if (prize) lines.push(center(prize), singleRule)
    const first = toRows(item.numbers)
    const second = toRows(secondChance)
    for (let row = 0; row < Math.max(first.length, second.length); row += 1) {
      lines.push(columns(first[row] ?? '', second[row] ?? ''))
    }
    lines.push(space)
  }

  if (item.luckySpins) {
    lines.push(doubleRule, center(`${item.luckySpins.count} GIROS DA SORTE`))
    if (item.luckySpins.label) lines.push(center(item.luckySpins.label))
  }

  const price = formatCurrency(item.unitPriceInCents)
  lines.push(
    doubleRule,
    left(`VALOR DA DOAÇÃO: ${price}`),
    left('QUANTIDADE: 1'),
    left(`TOTAL A PAGAR: ${price}`),
    left('VENDA: ONLINE'),
  )
  if (item.validationBatch) {
    lines.push(left(`LOTE: ${item.validationBatch}   POSIÇÃO: ${item.batchPosition ?? '—'}`))
  }
  if (purchase.paidAt) lines.push(left(`DATA DA COMPRA: ${formatDateTime(purchase.paidAt)}`))

  if (purchase.customer) {
    const { name, city, phone, cpf } = purchase.customer
    lines.push(doubleRule, space, left('DADOS DO CLIENTE'), singleRule, left(`NOME: ${name}`))
    if (city) lines.push(space, left(city))
    lines.push(left(`FONE: ${phone}`), left(`CPF: ${formatCpf(cpf)}`))
  }

  lines.push(doubleRule, space, ...footer.map((text) => (text ? left(text) : space)))
  return lines
}

function toRows(numbers: number[]) {
  const rows: string[] = []
  for (let index = 0; index < numbers.length; index += 5) {
    rows.push(
      numbers
        .slice(index, index + 5)
        .map((number) => String(number).padStart(2, '0'))
        .join('-'),
    )
  }
  return rows
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return `${dateFormatter.format(date)} ${timeFormatter.format(date)}`
}

function center(text: string): ReceiptLine {
  return { kind: 'text', text, align: 'center' }
}

function left(text: string): ReceiptLine {
  return { kind: 'text', text, align: 'left' }
}

function columns(leftText: string, rightText: string): ReceiptLine {
  return { kind: 'columns', left: leftText, right: rightText }
}
