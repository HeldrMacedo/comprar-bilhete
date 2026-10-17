import PDFDocument from 'pdfkit'
import {
  PRIZE_FOOTER,
  SOL_DA_SORTE_HEADER,
  type TicketCard,
  type TicketCardDocument,
} from './ticket-card.js'

type Pdf = InstanceType<typeof PDFDocument>

const CELL_WIDTH = 30
const CELL_HEIGHT = 17
const GRID_GAP = 36
const BRAND = '#0062ff'

// Um bilhete por página; bilhete grande continua na página seguinte. Helvetica padrão do
// PDF (WinAnsi) cobre acentos, ª, º, • e —.
export function renderTicketCardsPdf(document: TicketCardDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: { Title: 'Bilhetes Sol da Sorte' },
    })
    const chunks: Buffer[] = []
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk))
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)
    document.cards.forEach((card, index) => {
      if (index > 0) pdf.addPage()
      drawCard(pdf, document, card)
    })
    pdf.end()
  })
}

function drawCard(pdf: Pdf, document: TicketCardDocument, card: TicketCard) {
  const width = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right
  pdf.font('Helvetica-Bold').fontSize(14).fillColor(BRAND)
  pdf.text(SOL_DA_SORTE_HEADER[0], { align: 'center', width })
  pdf.font('Helvetica').fontSize(9).fillColor('#111111')
  for (const line of SOL_DA_SORTE_HEADER.slice(1)) pdf.text(line, { align: 'center', width })
  rule(pdf)
  pdf.font('Helvetica-Bold').fontSize(13).text(card.title, { align: 'center', width })
  pdf.font('Helvetica').fontSize(10).text(card.raffleTitle, { align: 'center', width })
  if (card.drawDate) pdf.text(`SORTEIO: ${card.drawDate}`, { align: 'center', width })
  rule(pdf)

  for (const prize of card.prizes) {
    const gridRows = Math.max(prize.first.length, prize.second.length)
    const needed = (prize.title ? 14 : 0) + 14 + gridRows * CELL_HEIGHT + 8
    ensureSpace(pdf, needed)
    if (prize.title) {
      pdf.font('Helvetica-Bold').fontSize(11).fillColor('#111111')
      pdf.text(prize.title, { align: 'center', width })
    }
    const withSecond = prize.second.length > 0
    const gridWidth = CELL_WIDTH * 5
    const totalWidth = withSecond ? gridWidth * 2 + GRID_GAP : gridWidth
    const left = pdf.page.margins.left + (width - totalWidth) / 2
    const top = pdf.y + 2
    drawGrid(pdf, left, top, withSecond ? '1ª CHANCE' : '', prize.first)
    if (withSecond) drawGrid(pdf, left + gridWidth + GRID_GAP, top, '2ª CHANCE', prize.second)
    pdf.x = pdf.page.margins.left
    pdf.y = top + 14 + gridRows * CELL_HEIGHT + 6
  }

  ensureSpace(pdf, footerHeight(pdf, card, document, width))
  rule(pdf)
  pdf.font('Helvetica').fontSize(10).fillColor('#111111')
  if (card.luckySpins) {
    pdf
      .font('Helvetica-Bold')
      .text(`${card.luckySpins.count} GIROS DA SORTE ${card.luckySpins.label}`.trim(), {
        align: 'center',
        width,
      })
      .font('Helvetica')
  }
  pdf.text(`VALOR DA DOAÇÃO: ${card.price}`, { width })
  pdf.text('VENDA: ONLINE', { width })
  if (card.batch) pdf.text(card.batch, { width })
  if (document.paidAt) pdf.text(`DATA DA COMPRA: ${document.paidAt}`, { width })
  rule(pdf)
  pdf.text(`NOME: ${document.customerName}`, { width })
  if (document.customerCity) pdf.text(`CIDADE: ${document.customerCity}`, { width })
  pdf.text(`CPF: ${document.maskedCpf}`, { width })
  rule(pdf)
  pdf.fontSize(8).fillColor('#374151')
  for (const line of PRIZE_FOOTER) {
    if (line) pdf.text(line, { width })
    else pdf.moveDown(0.4)
  }
}

// Altura do bloco final (giros, dados da compra, comprador e rodapé), medida com as mesmas
// fontes usadas no desenho, para que ele só vá para outra página se realmente não couber.
function footerHeight(pdf: Pdf, card: TicketCard, document: TicketCardDocument, width: number) {
  const lines = [
    card.luckySpins ? 1 : 0,
    2,
    card.batch ? 1 : 0,
    document.paidAt ? 1 : 0,
    2 + (document.customerCity ? 1 : 0),
  ].reduce((sum, count) => sum + count, 0)
  pdf.font('Helvetica').fontSize(10)
  const info = lines * pdf.currentLineHeight() + 3 * 10
  pdf.fontSize(8)
  const footer = PRIZE_FOOTER.reduce(
    (sum, line) =>
      sum + (line ? pdf.heightOfString(line, { width }) : pdf.currentLineHeight() * 0.4),
    0,
  )
  return info + footer + 4
}

function drawGrid(pdf: Pdf, left: number, top: number, label: string, rows: string[][]) {
  if (label) {
    pdf
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#374151')
      .text(label, left, top, { width: CELL_WIDTH * 5, align: 'center', lineBreak: false })
  }
  pdf.font('Helvetica-Bold').fontSize(11).fillColor('#111111').strokeColor('#1f2937')
  rows.forEach((row, rowIndex) => {
    for (let column = 0; column < 5; column += 1) {
      const x = left + column * CELL_WIDTH
      const y = top + 14 + rowIndex * CELL_HEIGHT
      pdf.rect(x, y, CELL_WIDTH, CELL_HEIGHT).stroke()
      const value = row[column]
      if (value) {
        pdf.text(value, x, y + 4, { width: CELL_WIDTH, align: 'center', lineBreak: false })
      }
    }
  })
}

function rule(pdf: Pdf) {
  const y = pdf.y + 4
  pdf
    .moveTo(pdf.page.margins.left, y)
    .lineTo(pdf.page.width - pdf.page.margins.right, y)
    .strokeColor('#9ca3af')
    .stroke()
  pdf.x = pdf.page.margins.left
  pdf.y = y + 6
}

function ensureSpace(pdf: Pdf, needed: number) {
  if (pdf.y + needed > pdf.page.height - pdf.page.margins.bottom) pdf.addPage()
}
