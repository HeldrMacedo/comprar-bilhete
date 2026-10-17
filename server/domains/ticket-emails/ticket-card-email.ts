import {
  PRIZE_FOOTER,
  SOL_DA_SORTE_HEADER,
  type TicketCard,
  type TicketCardDocument,
} from './ticket-card.js'

const BRAND = '#0062ff'
const FONT = 'font-family:Arial,Helvetica,sans-serif;'
// Estilos curtos e repetidos por dezena: o Gmail corta mensagens acima de ~102 KB.
const CELL =
  'font:bold 15px Arial,sans-serif;border:1px solid #1f2937;text-align:center;width:34px;height:30px'
const EMPTY_CELL = 'border:1px solid #e5e7eb;width:34px;height:30px'
// Orçamento do HTML dos cartões; o que passar disso segue só no PDF e em Meus bilhetes.
export const HTML_CARDS_BUDGET = 90_000
const LABEL = `${FONT}font-size:11px;font-weight:bold;color:#374151;padding:0 0 4px;text-align:center;`

export function renderTicketCardEmail(document: TicketCardDocument) {
  return {
    subject: 'Seus bilhetes Sol da Sorte — pagamento confirmado',
    html: renderHtml(document),
    text: renderText(document),
  }
}

function renderHtml(document: TicketCardDocument) {
  const paid = document.paidAt ? ` em ${escapeHtml(document.paidAt)}` : ''
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Seus bilhetes Sol da Sorte</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;"><tr><td align="center" style="padding:16px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;">
<tr><td style="${FONT}padding:20px;color:#111111;font-size:15px;line-height:1.5;">
<p style="margin:0 0 8px;">Olá, ${escapeHtml(document.customerName)}!</p>
<p style="margin:0 0 16px;">Recebemos o pagamento de <strong>${escapeHtml(document.totalPaid)}</strong>${paid}. Seus bilhetes estão abaixo e também no PDF em anexo.</p>
<p style="margin:0 0 8px;"><a href="${escapeHtml(document.myTicketsUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold;">Ver meus bilhetes</a></p>
</td></tr>
${renderCards(document)}
<tr><td style="${FONT}padding:16px 20px;color:#4b5563;font-size:12px;line-height:1.5;">
${PRIZE_FOOTER.filter(Boolean)
  .map((line) => `<p style="margin:0 0 6px;">${escapeHtml(line)}</p>`)
  .join('')}
<p style="margin:12px 0 0;">${SOL_DA_SORTE_HEADER.map(escapeHtml).join(' · ')}</p>
</td></tr>
</table></td></tr></table>
</body></html>`
}

function renderCards(document: TicketCardDocument) {
  const rendered: string[] = []
  let size = 0
  for (const card of document.cards) {
    const html = renderCard(card)
    if (rendered.length > 0 && size + html.length > HTML_CARDS_BUDGET) break
    rendered.push(html)
    size += html.length
  }
  const omitted = document.cards.length - rendered.length
  if (omitted > 0) {
    const noun = omitted === 1 ? 'bilhete' : 'bilhetes'
    rendered.push(
      `<tr><td style="${FONT}padding:12px 20px;font-size:14px;line-height:1.5;color:#111111;">E mais ${omitted} ${noun} no PDF em anexo e em <a href="${escapeHtml(document.myTicketsUrl)}" style="color:${BRAND};">Meus bilhetes</a>.</td></tr>`,
    )
  }
  return rendered.join('\n')
}

function renderCard(card: TicketCard) {
  const draw = card.drawDate ? `<br>Sorteio ${escapeHtml(card.drawDate)}` : ''
  const spins = card.luckySpins
    ? `<p style="${FONT}margin:8px 0 0;font-weight:bold;text-align:center;">${card.luckySpins.count} GIROS DA SORTE${
        card.luckySpins.label ? ` · ${escapeHtml(card.luckySpins.label)}` : ''
      }</p>`
    : ''
  const details = [card.price, card.batch, 'Venda online']
    .filter(Boolean)
    .map((value) => escapeHtml(value!))
    .join(' · ')
  return `<tr><td style="padding:8px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${BRAND};border-radius:8px;">
<tr><td style="${FONT}background:${BRAND};color:#ffffff;padding:10px 14px;font-size:13px;">
<strong style="font-size:15px;">SOL DA SORTE</strong> · ${escapeHtml(card.raffleTitle)}<br>
<strong style="font-size:17px;">${escapeHtml(card.title)}</strong>${draw}
</td></tr>
${card.prizes
  .map(
    (prize) => `<tr><td align="center" style="padding:10px 8px;border-bottom:1px dashed #9ca3af;">
${prize.title ? `<p style="${FONT}margin:0 0 6px;font-weight:bold;font-size:14px;">${escapeHtml(prize.title)}</p>` : ''}
${renderGrid('1ª CHANCE', prize.first, prize.second.length > 0)}${prize.second.length ? renderGrid('2ª CHANCE', prize.second, true) : ''}
</td></tr>`,
  )
  .join('\n')}
<tr><td style="${FONT}padding:10px 14px;font-size:13px;color:#374151;">${spins}<p style="margin:8px 0 0;text-align:center;">${details}</p></td></tr>
</table></td></tr>`
}

// Grades lado a lado em inline-block: em tela estreita, a segunda desce para baixo da primeira.
function renderGrid(label: string, rows: string[][], showLabel: boolean) {
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((value) => `<td style="${CELL}">${escapeHtml(value)}</td>`).join('')}${`<td style="${EMPTY_CELL}"></td>`.repeat(5 - row.length)}</tr>`,
    )
    .join('')
  return `<div style="display:inline-block;vertical-align:top;margin:4px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
${showLabel ? `<tr><td colspan="5" style="${LABEL}">${label}</td></tr>` : ''}${body}
</table></div>`
}

function renderText(document: TicketCardDocument) {
  const lines = [
    `Olá, ${document.customerName}!`,
    '',
    `Recebemos o pagamento de ${document.totalPaid}${document.paidAt ? ` em ${document.paidAt}` : ''}.`,
    `Veja seus bilhetes em ${document.myTicketsUrl}`,
  ]
  for (const card of document.cards) {
    lines.push('', '========================================', card.title, card.raffleTitle)
    if (card.drawDate) lines.push(`SORTEIO: ${card.drawDate}`)
    for (const prize of card.prizes) {
      lines.push('----------------------------------------')
      if (prize.title) lines.push(prize.title)
      const withSecond = prize.second.length > 0
      for (const row of prize.first)
        lines.push(`${withSecond ? '1ª CHANCE: ' : ''}${row.join('-')}`)
      for (const row of prize.second) lines.push(`2ª CHANCE: ${row.join('-')}`)
    }
    if (card.luckySpins) {
      lines.push(`${card.luckySpins.count} GIROS DA SORTE ${card.luckySpins.label}`.trim())
    }
    lines.push(`VALOR: ${card.price}`)
    if (card.batch) lines.push(card.batch)
  }
  lines.push('', ...PRIZE_FOOTER, '', ...SOL_DA_SORTE_HEADER)
  return lines.join('\n')
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  )
}
