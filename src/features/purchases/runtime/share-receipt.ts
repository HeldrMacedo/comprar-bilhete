import type { Purchase, PurchaseItem } from '../domain/types'
import { buildReceipt, type ReceiptLine } from '../service/receipt'

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

const width = 460
const padding = 20
const scale = 2
const lineHeight = 23
const ruleHeight = 14
const spaceHeight = 12
const font = '500 16px Arial, Helvetica, sans-serif'

export async function createReceiptFiles(purchase: Purchase, items: PurchaseItem[]) {
  return Promise.all(
    items.map(async (item) => {
      const blob = await renderReceipt(buildReceipt(purchase, item))
      const name = (item.identification ?? item.code).replace(/[^\w-]/g, '')
      return new File([blob], `bilhete-${name}.png`, { type: 'image/png' })
    }),
  )
}

// Compartilha pelo menu do aparelho (WhatsApp incluso); sem suporte a arquivos, baixa as imagens.
export async function shareReceipts(files: File[]): Promise<ShareOutcome> {
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files })) {
    try {
      await navigator.share({ files, title: 'Comprovante Sol da Sorte' })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      throw error
    }
  }

  for (const file of files) {
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.click()
    URL.revokeObjectURL(url)
  }
  return 'downloaded'
}

function renderReceipt(lines: ReceiptLine[]): Promise<Blob> {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('Canvas indisponível.'))
  context.font = font

  const rows = lines.flatMap((line): ReceiptLine[] =>
    line.kind === 'text' ? wrap(context, line.text).map((text) => ({ ...line, text })) : [line],
  )
  const height = rows.reduce((total, row) => total + rowHeight(row), padding * 2)
  canvas.width = width * scale
  canvas.height = height * scale

  context.scale(scale, scale)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#111111'
  context.strokeStyle = '#111111'
  context.font = font
  context.textBaseline = 'middle'

  let y = padding
  for (const row of rows) {
    const middle = y + rowHeight(row) / 2
    if (row.kind === 'rule') drawRule(context, middle, row.style)
    if (row.kind === 'text') {
      context.textAlign = row.align
      context.fillText(row.text, row.align === 'center' ? width / 2 : padding, middle)
    }
    if (row.kind === 'columns') {
      context.textAlign = 'center'
      context.fillText(row.left, width * 0.28, middle)
      context.fillText(row.right, width * 0.72, middle)
    }
    y += rowHeight(row)
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem.'))),
      'image/png',
    )
  })
}

function rowHeight(row: ReceiptLine) {
  if (row.kind === 'rule') return ruleHeight
  if (row.kind === 'space') return spaceHeight
  return lineHeight
}

function drawRule(context: CanvasRenderingContext2D, y: number, style: 'double' | 'single') {
  context.lineWidth = 1
  context.setLineDash(style === 'single' ? [5, 3] : [])
  const offsets = style === 'double' ? [-2, 2] : [0]
  for (const offset of offsets) {
    context.beginPath()
    context.moveTo(padding / 2, y + offset)
    context.lineTo(width - padding / 2, y + offset)
    context.stroke()
  }
  context.setLineDash([])
}

function wrap(context: CanvasRenderingContext2D, text: string) {
  const maxWidth = width - padding * 2
  const lines: string[] = []
  let current = ''
  for (const word of text.split(' ')) {
    const candidate = current ? `${current} ${word}` : word
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  lines.push(current)
  return lines
}
