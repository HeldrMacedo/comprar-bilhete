# E-mail com a cartela dos bilhetes — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar tarefa por tarefa. Passos usam checkbox (`- [ ]`).

**Objetivo:** quando um pedido vira `paid`, enviar ao cliente um e-mail com a cartela de cada bilhete (1ª e 2ª chance em grade de 5 colunas sob cada prêmio) e um PDF com os bilhetes em anexo, com fila, novas tentativas e reenvio pelo painel.

**Arquitetura:** `OrderRepository.markPaid` enfileira o e-mail em `order_emails` na mesma transação. O worker de 5 s chama `TicketEmailService.processNext()`, que monta a estrutura da cartela (`ticket-card.ts`), gera HTML/texto (`ticket-card-email.ts`) e PDF (`ticket-card-pdf.ts`, `pdfkit`) e envia por `MailGateway.send`. O painel mostra o status e reenvia por `POST /api/v1/admin/orders/:id/resend-email`.

**Tecnologias:** Fastify 5, `node:sqlite`, Nodemailer, `pdfkit` (novo), Zod 4, React 19, React Query 5, Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-10-17-email-bilhetes-design.md](../../superpowers/specs/2026-10-17-email-bilhetes-design.md)

## Restrições globais

- TypeScript estrito sem `any`; dinheiro em centavos inteiros; textos de usuário em português brasileiro.
- Datas exibidas no fuso `America/Fortaleza`, como o comprovante do navegador.
- Corpo do e-mail sem CPF, telefone ou endereço; PDF com nome, cidade e CPF mascarado `***.950.174-**`.
- `last_error` e logs nunca contêm destinatário nem conteúdo do e-mail; só `code`, `responseCode`, `command` do nodemailer.
- Novas tentativas: 1 min, 5 min, 30 min, 2 h; na 5ª falha, `failed`. Reserva do item por 10 min.
- Branch `feat/email-bilhetes` (criada a partir de `feat/login-cliente`).
- `npm run check` ao fim de cada tarefa que toca código; `npm run test:e2e` na tarefa final.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Critérios de aceite

- Pedido pago por webhook, aprovação manual ou reprocessamento gera exatamente um e-mail.
- E-mail HTML com a cartela, versão em texto e anexo `bilhetes-<8 caracteres>.pdf`.
- Falha do SMTP não afeta o pedido; tenta de novo e, após 5 falhas, fica `failed`.
- Painel de vendas mostra Na fila / Enviado / Falhou / Sem e-mail e permite reenviar pedidos pagos (inclusive pagos antes desta mudança, que não têm registro).

## Mapa de arquivos

Backend:

- `server/shared/database-migrations.ts` — migração v9 (`ORDER_EMAILS_SCHEMA`).
- `server/domains/orders/order-repository.ts` — `markPaid` enfileira.
- `server/domains/ticket-emails/ticket-email-repository.ts` — fila.
- `server/domains/ticket-emails/ticket-card.ts` — estrutura pura da cartela.
- `server/domains/ticket-emails/ticket-card-email.ts` — HTML e texto.
- `server/domains/ticket-emails/ticket-card-pdf.ts` — PDF.
- `server/domains/ticket-emails/ticket-email-service.ts` — `processNext`, `resend`, `statusesOf`.
- `server/domains/accounts/mail-gateway.ts`, `smtp-mail-gateway.ts`, `mock-mail-gateway.ts` — `send`.
- `server/app.ts` — composição e worker.
- `server/domains/admin/admin-sales-service.ts`, `server/http/admin-presenter.ts`, `server/http/admin-routes.ts` — status e reenvio.

Frontend:

- `src/shared/config/api-routes.ts`, `src/features/admin/{api/schemas.ts,domain/types.ts,service/order-labels.ts,ui/OrderActionDialog.tsx}`, `src/pages/admin/AdminSalesPage.tsx`.

Testes e docs: arquivos `*.test.ts` ao lado de cada módulo, `tests/e2e/admin-sales.spec.ts`, `docs/API_CONTRACTS.md`, `docs/SECURITY.md`, `docs/PRODUCT.md`, `ARCHITECTURE.md`.

---

### Tarefa 1: Fila `order_emails` e enfileiramento no `markPaid`

**Arquivos:**

- Modificar: `server/shared/database-migrations.ts`
- Modificar: `server/shared/database.test.ts:25,108` (versão 8 → 9)
- Modificar: `server/domains/orders/order-repository.ts:246-250`
- Criar: `server/domains/ticket-emails/ticket-email-repository.ts`
- Teste: `server/domains/ticket-emails/ticket-email-repository.test.ts`

**Interfaces:**

- Produz: `type TicketEmailStatus = 'pending' | 'sent' | 'failed' | 'no_recipient'`; classe `TicketEmailRepository(database: AppDatabase, now: () => Date)` com `claimNext(): { orderId: string; attempts: number } | null`, `markSent(orderId)`, `markNoRecipient(orderId)`, `markFailedAttempt(orderId, attempts: number, nextAttemptAt: Date | null, error: string)`, `get(orderId): { status: TicketEmailStatus; attempts: number; lastError?: string; sentAt?: string } | null`, `requeue(orderId)`, `getStatuses(orderIds: string[]): Map<string, TicketEmailStatus>`.

- [ ] **Passo 1: testes que falham**

`server/domains/ticket-emails/ticket-email-repository.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../../shared/database.js'
import { OrderRepository } from '../orders/order-repository.js'
import { existingMaria, order } from '../orders/order-test-fixtures.js'
import { TicketEmailRepository } from './ticket-email-repository.js'

let current = new Date('2026-10-17T12:00:00.000Z')
const now = () => current
const databases: Array<ReturnType<typeof createDatabase>> = []

afterEach(() => {
  databases.splice(0).forEach((database) => database.close())
  current = new Date('2026-10-17T12:00:00.000Z')
})

function setup(email: string | undefined = 'maria@example.com') {
  const database = createDatabase(':memory:')
  databases.push(database)
  const orders = new OrderRepository(database, now)
  const paid = order({
    customer: { ...existingMaria, ...(email ? { email } : {}) },
    expiresAt: '2026-10-17T13:00:00.000Z',
  })
  orders.create(paid)
  return { orders, emails: new TicketEmailRepository(database, now), orderId: paid.id }
}

describe('TicketEmailRepository', () => {
  it('markPaid enfileira um único e-mail por pedido', () => {
    const { orders, emails, orderId } = setup()
    orders.markPaid(orderId)
    orders.markPaid(orderId)
    expect(emails.get(orderId)).toMatchObject({ status: 'pending', attempts: 0 })
    expect(emails.claimNext()).toEqual({ orderId, attempts: 0 })
    expect(emails.claimNext()).toBeNull()
  })

  it('pedido sem e-mail nasce sem destinatário e nunca é reservado', () => {
    const { orders, emails, orderId } = setup(undefined)
    orders.markPaid(orderId)
    expect(emails.get(orderId)).toMatchObject({ status: 'no_recipient' })
    expect(emails.claimNext()).toBeNull()
  })

  it('reserva por 10 minutos: item preso volta para a fila depois disso', () => {
    const { orders, emails, orderId } = setup()
    orders.markPaid(orderId)
    expect(emails.claimNext()).not.toBeNull()
    current = new Date('2026-10-17T12:09:59.000Z')
    expect(emails.claimNext()).toBeNull()
    current = new Date('2026-10-17T12:10:00.000Z')
    expect(emails.claimNext()).toEqual({ orderId, attempts: 0 })
  })

  it('registra tentativa falha, falha definitiva, envio e reenvio', () => {
    const { orders, emails, orderId } = setup()
    orders.markPaid(orderId)
    emails.claimNext()
    emails.markFailedAttempt(orderId, 1, new Date('2026-10-17T12:01:00.000Z'), 'code=EAUTH')
    expect(emails.get(orderId)).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError: 'code=EAUTH',
    })
    expect(emails.claimNext()).toBeNull()
    current = new Date('2026-10-17T12:01:00.000Z')
    expect(emails.claimNext()).toEqual({ orderId, attempts: 1 })

    emails.markFailedAttempt(orderId, 5, null, 'code=ETIMEDOUT')
    expect(emails.get(orderId)).toMatchObject({ status: 'failed', attempts: 5 })

    emails.requeue(orderId)
    expect(emails.get(orderId)).toMatchObject({ status: 'pending', attempts: 0 })
    emails.claimNext()
    emails.markSent(orderId)
    expect(emails.get(orderId)).toMatchObject({
      status: 'sent',
      sentAt: current.toISOString(),
    })
    expect(emails.getStatuses([orderId, 'outro'])).toEqual(new Map([[orderId, 'sent']]))
  })

  it('requeue cria o registro de pedido pago antes da fila existir', () => {
    const { emails, orderId } = setup()
    emails.requeue(orderId)
    expect(emails.get(orderId)).toMatchObject({ status: 'pending', attempts: 0 })
  })
})
```

No `server/shared/database.test.ts`, trocar as duas asserções `user_version: 8` por `user_version: 9` e incluir `'order_emails'` na lista de `expect.arrayContaining([...])` de tabelas.

- [ ] **Passo 2: confirmar falha**

Run: `npx vitest run server/domains/ticket-emails/ticket-email-repository.test.ts server/shared/database.test.ts`
Expected: FAIL (módulo `./ticket-email-repository.js` inexistente; `user_version` 8).

- [ ] **Passo 3: migração v9**

Em `server/shared/database-migrations.ts`: `CURRENT_SCHEMA_VERSION = 9`; em `migrateDatabase`, depois de `if (version < 8) ...`, acrescentar `if (version < 9) migrateToVersion9(database)`; em `createLatestSchema`, depois de `database.exec(ACCOUNT_SCHEMA)`, acrescentar `database.exec(ORDER_EMAILS_SCHEMA)`. No fim do arquivo:

```ts
const ORDER_EMAILS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS order_emails (
    order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'no_recipient')),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT NOT NULL,
    last_error TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_order_emails_queue ON order_emails(status, next_attempt_at);
`

function migrateToVersion9(database: DatabaseSync) {
  database.exec(ORDER_EMAILS_SCHEMA)
}
```

- [ ] **Passo 4: `markPaid` enfileira**

Substituir `markPaid` em `server/domains/orders/order-repository.ts`:

```ts
  // O e-mail dos bilhetes entra na fila junto com o status: webhook repetido, reprocessamento
  // ou nova aprovação não geram segundo envio (order_id é a chave).
  markPaid(orderId: string) {
    const now = this.now().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database
        .prepare("UPDATE orders SET status = 'paid', paid_at = ?, last_error = NULL WHERE id = ?")
        .run(now, orderId)
      this.database
        .prepare(
          `INSERT OR IGNORE INTO order_emails (
             order_id, status, attempts, next_attempt_at, created_at, updated_at
           )
           SELECT id,
                  CASE WHEN COALESCE(json_extract(customer_json, '$.email'), '') = ''
                       THEN 'no_recipient' ELSE 'pending' END,
                  0, ?, ?, ?
           FROM orders WHERE id = ?`,
        )
        .run(now, now, now, orderId)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
```

- [ ] **Passo 5: repositório da fila**

`server/domains/ticket-emails/ticket-email-repository.ts`:

```ts
import { z } from 'zod'
import type { AppDatabase } from '../../shared/database.js'

export const ticketEmailStatusSchema = z.enum(['pending', 'sent', 'failed', 'no_recipient'])
export type TicketEmailStatus = z.infer<typeof ticketEmailStatusSchema>

const CLAIM_LEASE_MS = 10 * 60_000

const rowSchema = z.object({
  status: ticketEmailStatusSchema,
  attempts: z.number().int(),
  last_error: z.string().nullable(),
  sent_at: z.string().nullable(),
})

export class TicketEmailRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // Reserva o próximo envio vencido empurrando next_attempt_at: se o processo cair no meio do
  // envio, o item volta sozinho para a fila depois da reserva.
  claimNext(): { orderId: string; attempts: number } | null {
    const now = this.now()
    const row = this.database
      .prepare(
        `UPDATE order_emails SET next_attempt_at = ?, updated_at = ?
         WHERE order_id = (
           SELECT order_id FROM order_emails
           WHERE status = 'pending' AND next_attempt_at <= ?
           ORDER BY next_attempt_at LIMIT 1
         )
         RETURNING order_id, attempts`,
      )
      .get(
        new Date(now.getTime() + CLAIM_LEASE_MS).toISOString(),
        now.toISOString(),
        now.toISOString(),
      ) as { order_id: string; attempts: number } | undefined
    return row ? { orderId: row.order_id, attempts: row.attempts } : null
  }

  markSent(orderId: string) {
    const now = this.now().toISOString()
    this.database
      .prepare(
        "UPDATE order_emails SET status = 'sent', sent_at = ?, last_error = NULL, updated_at = ? WHERE order_id = ?",
      )
      .run(now, now, orderId)
  }

  markNoRecipient(orderId: string) {
    this.database
      .prepare("UPDATE order_emails SET status = 'no_recipient', updated_at = ? WHERE order_id = ?")
      .run(this.now().toISOString(), orderId)
  }

  // nextAttemptAt null encerra as tentativas.
  markFailedAttempt(orderId: string, attempts: number, nextAttemptAt: Date | null, error: string) {
    const now = this.now().toISOString()
    this.database
      .prepare(
        `UPDATE order_emails
         SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
         WHERE order_id = ?`,
      )
      .run(
        nextAttemptAt ? 'pending' : 'failed',
        attempts,
        (nextAttemptAt ?? this.now()).toISOString(),
        error.slice(0, 500),
        now,
        orderId,
      )
  }

  get(orderId: string) {
    const row = this.database
      .prepare('SELECT status, attempts, last_error, sent_at FROM order_emails WHERE order_id = ?')
      .get(orderId)
    if (!row) return null
    const parsed = rowSchema.parse(row)
    return {
      status: parsed.status,
      attempts: parsed.attempts,
      ...(parsed.last_error ? { lastError: parsed.last_error } : {}),
      ...(parsed.sent_at ? { sentAt: parsed.sent_at } : {}),
    }
  }

  // Volta para a fila com tentativas zeradas; cria o registro de pedido pago antes da fila.
  requeue(orderId: string) {
    const now = this.now().toISOString()
    this.database
      .prepare(
        `INSERT INTO order_emails (order_id, status, attempts, next_attempt_at, created_at, updated_at)
         VALUES (?, 'pending', 0, ?, ?, ?)
         ON CONFLICT(order_id) DO UPDATE SET
           status = 'pending', attempts = 0, next_attempt_at = excluded.next_attempt_at,
           last_error = NULL, updated_at = excluded.updated_at`,
      )
      .run(orderId, now, now, now)
  }

  getStatuses(orderIds: string[]) {
    const statuses = new Map<string, TicketEmailStatus>()
    if (orderIds.length === 0) return statuses
    const rows = this.database
      .prepare(
        `SELECT order_id, status FROM order_emails WHERE order_id IN (${orderIds.map(() => '?').join(', ')})`,
      )
      .all(...orderIds) as Array<{ order_id: string; status: string }>
    for (const row of rows) statuses.set(row.order_id, ticketEmailStatusSchema.parse(row.status))
    return statuses
  }
}
```

- [ ] **Passo 6: confirmar que passa**

Run: `npx vitest run server/domains/ticket-emails server/shared/database.test.ts server/domains/orders`
Expected: PASS.

- [ ] **Passo 7: commit**

```bash
git add server/shared/database-migrations.ts server/shared/database.test.ts server/domains/orders/order-repository.ts server/domains/ticket-emails
git commit -m "feat(server): fila de e-mail dos bilhetes ao marcar pedido como pago"
```

---

### Tarefa 2: Estrutura da cartela (`ticket-card.ts`)

**Arquivos:**

- Criar: `server/domains/ticket-emails/ticket-card.ts`
- Teste: `server/domains/ticket-emails/ticket-card.test.ts`

**Interfaces:**

- Consome: `Order` de `server/domains/orders/order-types.ts`.
- Produz:

```ts
export type TicketCardPrize = { title?: string; first: string[][]; second: string[][] }
export type TicketCard = {
  title: string // 'BILHETE <identificacao ou numero>'
  raffleTitle: string
  drawDate?: string // 'dd/mm/aaaa'
  prizes: TicketCardPrize[]
  luckySpins?: { count: number; label: string }
  price: string // 'R$ 10,00'
  batch?: string // 'LOTE: 77   POSIÇÃO: 3'
}
export type TicketCardDocument = {
  customerName: string
  customerCity?: string
  maskedCpf: string
  totalPaid: string
  paidAt?: string // 'dd/mm/aaaa hh:mm'
  myTicketsUrl: string
  orderShortId: string
  cards: TicketCard[]
}
export const SOL_DA_SORTE_HEADER: readonly string[]
export const PRIZE_FOOTER: readonly string[]
export function buildTicketCards(order: Order, appUrl: string): TicketCardDocument
```

- [ ] **Passo 1: testes que falham**

`server/domains/ticket-emails/ticket-card.test.ts`:

```ts
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
})
```

- [ ] **Passo 2: confirmar falha**

Run: `npx vitest run server/domains/ticket-emails/ticket-card.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Passo 3: implementação**

`server/domains/ticket-emails/ticket-card.ts`:

```ts
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
```

- [ ] **Passo 4: confirmar que passa**

Run: `npx vitest run server/domains/ticket-emails/ticket-card.test.ts`
Expected: PASS. Se o rodapé de `receipt.ts` divergir do copiado aqui, copie exatamente o de `receipt.ts`.

- [ ] **Passo 5: commit**

```bash
git add server/domains/ticket-emails/ticket-card.ts server/domains/ticket-emails/ticket-card.test.ts
git commit -m "feat(server): estrutura da cartela de bilhetes para e-mail e PDF"
```

---

### Tarefa 3: HTML e texto do e-mail (`ticket-card-email.ts`)

**Arquivos:**

- Criar: `server/domains/ticket-emails/ticket-card-email.ts`
- Teste: `server/domains/ticket-emails/ticket-card-email.test.ts`

**Interfaces:**

- Consome: `TicketCardDocument`, `SOL_DA_SORTE_HEADER`, `PRIZE_FOOTER` (Tarefa 2).
- Produz: `renderTicketCardEmail(document: TicketCardDocument): { subject: string; html: string; text: string }`.

- [ ] **Passo 1: testes que falham**

`server/domains/ticket-emails/ticket-card-email.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { TicketCardDocument } from './ticket-card.js'
import { renderTicketCardEmail } from './ticket-card-email.js'

const document: TicketCardDocument = {
  customerName: 'Maria <script>alert(1)</script>',
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
})
```

- [ ] **Passo 2: confirmar falha**

Run: `npx vitest run server/domains/ticket-emails/ticket-card-email.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Passo 3: implementação**

`server/domains/ticket-emails/ticket-card-email.ts`:

```ts
import {
  PRIZE_FOOTER,
  SOL_DA_SORTE_HEADER,
  type TicketCard,
  type TicketCardDocument,
} from './ticket-card.js'

const BRAND = '#0062ff'
const FONT = 'font-family:Arial,Helvetica,sans-serif;'
const CELL = `${FONT}width:34px;height:30px;border:1px solid #1f2937;text-align:center;font-size:15px;font-weight:bold;color:#111111;`
const EMPTY_CELL = 'width:34px;height:30px;border:1px solid #e5e7eb;'
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
${document.cards.map(renderCard).join('\n')}
<tr><td style="${FONT}padding:16px 20px;color:#4b5563;font-size:12px;line-height:1.5;">
${PRIZE_FOOTER.filter(Boolean)
  .map((line) => `<p style="margin:0 0 6px;">${escapeHtml(line)}</p>`)
  .join('')}
<p style="margin:12px 0 0;">${SOL_DA_SORTE_HEADER.map(escapeHtml).join(' · ')}</p>
</td></tr>
</table></td></tr></table>
</body></html>`
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
```

- [ ] **Passo 4: confirmar que passa**

Run: `npx vitest run server/domains/ticket-emails/ticket-card-email.test.ts`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add server/domains/ticket-emails/ticket-card-email.ts server/domains/ticket-emails/ticket-card-email.test.ts
git commit -m "feat(server): HTML e texto do e-mail com a cartela dos bilhetes"
```

---

### Tarefa 4: PDF dos bilhetes (`ticket-card-pdf.ts`)

**Arquivos:**

- Modificar: `package.json`, `package-lock.json` (`pdfkit`, `@types/pdfkit`)
- Criar: `server/domains/ticket-emails/ticket-card-pdf.ts`
- Teste: `server/domains/ticket-emails/ticket-card-pdf.test.ts`

**Interfaces:**

- Consome: `TicketCardDocument`, `SOL_DA_SORTE_HEADER`, `PRIZE_FOOTER` (Tarefa 2).
- Produz: `renderTicketCardsPdf(document: TicketCardDocument): Promise<Buffer>`.

- [ ] **Passo 1: dependências**

Run: `npm install pdfkit && npm install -D @types/pdfkit`
Expected: `pdfkit` em `dependencies`, `@types/pdfkit` em `devDependencies`.

- [ ] **Passo 2: testes que falham**

`server/domains/ticket-emails/ticket-card-pdf.test.ts`:

```ts
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
    expect(pageCount(pdf)).toBeGreaterThanOrEqual(2)
  })

  it('bilhete pequeno ocupa uma página só', async () => {
    const small = await renderTicketCardsPdf({
      ...document,
      cards: [{ ...card, prizes: [{ first: [rows[0]!], second: [] }] }],
    })
    expect(pageCount(small)).toBe(1)
  })
})
```

- [ ] **Passo 3: confirmar falha**

Run: `npx vitest run server/domains/ticket-emails/ticket-card-pdf.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Passo 4: implementação**

`server/domains/ticket-emails/ticket-card-pdf.ts`:

```ts
import PDFDocument from 'pdfkit'
import {
  PRIZE_FOOTER,
  SOL_DA_SORTE_HEADER,
  type TicketCard,
  type TicketCardDocument,
} from './ticket-card.js'

type Pdf = InstanceType<typeof PDFDocument>

const CELL_WIDTH = 30
const CELL_HEIGHT = 20
const GRID_GAP = 36
const BRAND = '#0062ff'

// Um bilhete por página; bilhete grande continua na página seguinte. Helvetica padrão do
// PDF cobre acentos, ª, º e •.
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
    const needed = (prize.title ? 16 : 0) + 14 + gridRows * CELL_HEIGHT + 12
    ensureSpace(pdf, needed)
    if (prize.title) {
      pdf.font('Helvetica-Bold').fontSize(11).text(prize.title, { align: 'center', width })
    }
    const withSecond = prize.second.length > 0
    const gridWidth = CELL_WIDTH * 5
    const totalWidth = withSecond ? gridWidth * 2 + GRID_GAP : gridWidth
    const left = pdf.page.margins.left + (width - totalWidth) / 2
    const top = pdf.y + 2
    drawGrid(pdf, left, top, withSecond ? '1ª CHANCE' : '', prize.first)
    if (withSecond) drawGrid(pdf, left + gridWidth + GRID_GAP, top, '2ª CHANCE', prize.second)
    pdf.x = pdf.page.margins.left
    pdf.y = top + 14 + gridRows * CELL_HEIGHT + 10
  }

  ensureSpace(pdf, 200)
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
        pdf.text(value, x, y + 5, { width: CELL_WIDTH, align: 'center', lineBreak: false })
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
```

- [ ] **Passo 5: confirmar que passa**

Run: `npx vitest run server/domains/ticket-emails/ticket-card-pdf.test.ts && npx tsc -p tsconfig.server.json --noEmit`
Expected: PASS e sem erros de tipo. Se a importação padrão de `pdfkit` falhar no tipo, usar `import PDFDocument = require('pdfkit')` não é permitido em ESM; confirme `esModuleInterop` no `tsconfig.server.json` e mantenha `import PDFDocument from 'pdfkit'`.

- [ ] **Passo 6: commit**

```bash
git add package.json package-lock.json server/domains/ticket-emails/ticket-card-pdf.ts server/domains/ticket-emails/ticket-card-pdf.test.ts
git commit -m "feat(server): PDF com os bilhetes do pedido"
```

---

### Tarefa 5: `MailGateway.send` (SMTP e mock)

**Arquivos:**

- Modificar: `server/domains/accounts/mail-gateway.ts`
- Modificar: `server/domains/accounts/smtp-mail-gateway.ts`
- Modificar: `server/domains/accounts/mock-mail-gateway.ts`
- Teste: `server/domains/accounts/smtp-mail-gateway.test.ts`

**Interfaces:**

- Produz:

```ts
export type MailAttachment = { filename: string; content: Buffer; contentType: string }
export type MailMessage = {
  to: string
  subject: string
  html: string
  text: string
  attachments?: MailAttachment[]
}
export type MailFailureDetails = { code?: string; responseCode?: number; command?: string }
export class MailDeliveryError extends Error {
  readonly details: MailFailureDetails
  get summary(): string // 'code=EAUTH responseCode=535 command=AUTH PLAIN'
}
// MailGateway ganha: send(message: MailMessage): Promise<void>
// MockMailGateway ganha: readonly messages: MailMessage[]
```

- [ ] **Passo 1: testes que falham**

Acrescentar ao `describe('SmtpMailGateway', ...)` em `server/domains/accounts/smtp-mail-gateway.test.ts` (importar `MailDeliveryError` de `./mail-gateway.js`):

```ts
it('envia mensagem com HTML, texto e anexos pelo remetente configurado', async () => {
  sendMail.mockResolvedValue({})
  const gateway = new SmtpMailGateway(env, { error: vi.fn() })
  const content = Buffer.from('%PDF-')
  await gateway.send({
    to: 'maria@example.com',
    subject: 'Assunto',
    html: '<p>Oi</p>',
    text: 'Oi',
    attachments: [{ filename: 'bilhetes.pdf', content, contentType: 'application/pdf' }],
  })
  expect(sendMail).toHaveBeenCalledWith({
    from: 'Sol da Sorte <nao-responda@example.com>',
    to: 'maria@example.com',
    subject: 'Assunto',
    html: '<p>Oi</p>',
    text: 'Oi',
    attachments: [{ filename: 'bilhetes.pdf', content, contentType: 'application/pdf' }],
  })
})

it('falha no envio vira MailDeliveryError só com dados técnicos', async () => {
  sendMail.mockRejectedValue(
    Object.assign(new Error('falhou para maria@example.com'), {
      code: 'EENVELOPE',
      responseCode: 550,
      command: 'RCPT TO',
    }),
  )
  const log = { error: vi.fn() }
  const gateway = new SmtpMailGateway(env, log)
  const failure = gateway.send({ to: 'maria@example.com', subject: 's', html: 'h', text: 't' })

  await expect(failure).rejects.toBeInstanceOf(MailDeliveryError)
  await expect(failure).rejects.toMatchObject({
    summary: 'code=EENVELOPE responseCode=550 command=RCPT TO',
  })
  expect(log.error).toHaveBeenCalledWith(
    { code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO' },
    'Falha ao enviar e-mail dos bilhetes',
  )
  expect(JSON.stringify(log.error.mock.calls)).not.toContain('maria@example.com')
})
```

- [ ] **Passo 2: confirmar falha**

Run: `npx vitest run server/domains/accounts/smtp-mail-gateway.test.ts`
Expected: FAIL (`MailDeliveryError` não exportado / `send` inexistente).

- [ ] **Passo 3: implementação**

`server/domains/accounts/mail-gateway.ts` — acrescentar antes da interface e incluir `send` nela:

```ts
export type MailAttachment = { filename: string; content: Buffer; contentType: string }

export type MailMessage = {
  to: string
  subject: string
  html: string
  text: string
  attachments?: MailAttachment[]
}

export type MailFailureDetails = { code?: string; responseCode?: number; command?: string }

// Falha de envio sem destinatário nem conteúdo: só os campos técnicos do SMTP.
export class MailDeliveryError extends Error {
  constructor(readonly details: MailFailureDetails) {
    super('Falha ao enviar e-mail.')
  }

  get summary() {
    return (
      Object.entries(this.details)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(' ') || 'falha sem detalhes do SMTP'
    )
  }
}

export interface MailGateway {
  sendVerificationCode(to: string, code: string): Promise<void>
  send(message: MailMessage): Promise<void>
}
```

`server/domains/accounts/smtp-mail-gateway.ts` — importar `MailDeliveryError, type MailMessage` e acrescentar o método:

```ts
  async send(message: MailMessage) {
    try {
      await this.transporter.sendMail({ from: this.from, ...message })
    } catch (error) {
      const parsed = smtpErrorSchema.safeParse(error)
      const details = parsed.success ? parsed.data : {}
      this.log.error(details, 'Falha ao enviar e-mail dos bilhetes')
      throw new MailDeliveryError(details)
    }
  }
```

Atenção: o teste espera `sendMail` chamado com as chaves na ordem `from, to, subject, html, text, attachments`; `toHaveBeenCalledWith` não depende da ordem, mas sem `attachments` a chave não deve aparecer — `...message` já garante isso.

`server/domains/accounts/mock-mail-gateway.ts`:

```ts
import type { MailGateway, MailMessage } from './mail-gateway.js'

// Guarda os envios em memória para testes; nada sai do processo.
export class MockMailGateway implements MailGateway {
  readonly sent: Array<{ to: string; code: string }> = []
  readonly messages: MailMessage[] = []

  async sendVerificationCode(to: string, code: string) {
    this.sent.push({ to, code })
  }

  async send(message: MailMessage) {
    this.messages.push(message)
  }
}
```

- [ ] **Passo 4: confirmar que passa**

Run: `npx vitest run server/domains/accounts && npx tsc -p tsconfig.server.json --noEmit`
Expected: PASS. Se algum teste criar um `MailGateway` literal, acrescentar `send: async () => {}` a ele.

- [ ] **Passo 5: commit**

```bash
git add server/domains/accounts/mail-gateway.ts server/domains/accounts/smtp-mail-gateway.ts server/domains/accounts/mock-mail-gateway.ts server/domains/accounts/smtp-mail-gateway.test.ts
git commit -m "feat(server): envio de e-mail genérico com anexos no MailGateway"
```

---

### Tarefa 6: `TicketEmailService` e worker

**Arquivos:**

- Criar: `server/domains/ticket-emails/ticket-email-service.ts`
- Teste: `server/domains/ticket-emails/ticket-email-service.test.ts`
- Modificar: `server/app.ts`

**Interfaces:**

- Consome: `TicketEmailRepository` (Tarefa 1), `buildTicketCards` (2), `renderTicketCardEmail` (3), `renderTicketCardsPdf` (4), `MailGateway.send`, `MailDeliveryError` (5), `OrderRepository.get`.
- Produz: classe `TicketEmailService(repository: TicketEmailRepository, orders: OrderRepository, mail: MailGateway, appUrl: string, now: () => Date)` com `processNext(): Promise<boolean>`, `processPending(limit?: number): Promise<number>`, `resend(orderId: string): void`, `statusesOf(orderIds: string[]): Map<string, TicketEmailStatus>`. Em `server/app.ts`, a instância `ticketEmails` fica disponível para a Tarefa 7.

- [ ] **Passo 1: testes que falham**

`server/domains/ticket-emails/ticket-email-service.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MailDeliveryError } from '../accounts/mail-gateway.js'
import { MockMailGateway } from '../accounts/mock-mail-gateway.js'
import { createDatabase } from '../../shared/database.js'
import { OrderRepository } from '../orders/order-repository.js'
import { existingMaria, order } from '../orders/order-test-fixtures.js'
import { TicketEmailRepository } from './ticket-email-repository.js'
import { TicketEmailService } from './ticket-email-service.js'

let current = new Date('2026-10-17T12:00:00.000Z')
const now = () => current
const databases: Array<ReturnType<typeof createDatabase>> = []

afterEach(() => {
  databases.splice(0).forEach((database) => database.close())
  current = new Date('2026-10-17T12:00:00.000Z')
})

function setup(email: string | undefined = 'maria@example.com') {
  const database = createDatabase(':memory:')
  databases.push(database)
  const orders = new OrderRepository(database, now)
  const repository = new TicketEmailRepository(database, now)
  const mail = new MockMailGateway()
  const service = new TicketEmailService(repository, orders, mail, 'http://localhost:5173', now)
  const created = order({
    customer: { ...existingMaria, ...(email ? { email } : {}) },
    expiresAt: '2026-10-17T13:00:00.000Z',
  })
  orders.create(created)
  return { orders, repository, mail, service, orderId: created.id }
}

describe('TicketEmailService', () => {
  it('envia o e-mail com a cartela e o PDF e marca como enviado', async () => {
    const { orders, repository, mail, service, orderId } = setup()
    orders.markPaid(orderId)

    expect(await service.processNext()).toBe(true)
    expect(await service.processNext()).toBe(false)
    expect(mail.messages).toHaveLength(1)
    expect(mail.messages[0]).toMatchObject({
      to: 'maria@example.com',
      subject: 'Seus bilhetes Sol da Sorte — pagamento confirmado',
      attachments: [
        { filename: `bilhetes-${orderId.slice(0, 8)}.pdf`, contentType: 'application/pdf' },
      ],
    })
    expect(mail.messages[0]!.attachments![0]!.content.subarray(0, 5).toString()).toBe('%PDF-')
    expect(repository.get(orderId)).toMatchObject({ status: 'sent' })
  })

  it('tenta de novo em 1, 5, 30 e 120 minutos e desiste na 5ª falha', async () => {
    const { orders, repository, mail, service, orderId } = setup()
    vi.spyOn(mail, 'send').mockRejectedValue(new MailDeliveryError({ code: 'ECONNECTION' }))
    orders.markPaid(orderId)

    const delays = [1, 5, 30, 120]
    for (const [index, minutes] of delays.entries()) {
      expect(await service.processNext()).toBe(true)
      expect(repository.get(orderId)).toMatchObject({
        status: 'pending',
        attempts: index + 1,
        lastError: 'code=ECONNECTION',
      })
      current = new Date(current.getTime() + minutes * 60_000 - 1)
      expect(await service.processNext()).toBe(false)
      current = new Date(current.getTime() + 1)
    }
    expect(await service.processNext()).toBe(true)
    expect(repository.get(orderId)).toMatchObject({ status: 'failed', attempts: 5 })
  })

  it('processPending esvazia a fila até o limite por rodada', async () => {
    const { orders, mail, service, orderId } = setup()
    const second = order({
      id: '00000000-0000-4000-8000-000000000002',
      customer: { ...existingMaria, email: 'maria@example.com' },
      items: [{ ...order().items[0]!, id: 'card-002', code: 'card-002' }],
      expiresAt: '2026-10-17T13:00:00.000Z',
    })
    orders.create(second)
    orders.markPaid(orderId)
    orders.markPaid(second.id)

    expect(await service.processPending(1)).toBe(1)
    expect(await service.processPending()).toBe(1)
    expect(await service.processPending()).toBe(0)
    expect(mail.messages).toHaveLength(2)
  })

  it('pedido sem e-mail não envia nada', async () => {
    const { orders, mail, service, orderId } = setup(undefined)
    orders.markPaid(orderId)
    expect(await service.processNext()).toBe(false)
    expect(mail.messages).toHaveLength(0)
  })

  it('reenvio aceita pedido pago enviado, falho ou sem registro e recusa os demais', () => {
    const { orders, repository, service, orderId } = setup()
    expect(() => service.resend(orderId)).toThrow(
      expect.objectContaining({ code: 'ORDER_NOT_PAID', statusCode: 409 }),
    )

    orders.markPaid(orderId)
    expect(() => service.resend(orderId)).toThrow(
      expect.objectContaining({ code: 'EMAIL_ALREADY_QUEUED', statusCode: 409 }),
    )

    repository.claimNext()
    repository.markSent(orderId)
    service.resend(orderId)
    expect(repository.get(orderId)).toMatchObject({ status: 'pending', attempts: 0 })
    expect(service.statusesOf([orderId])).toEqual(new Map([[orderId, 'pending']]))
    expect(() => service.resend('00000000-0000-4000-8000-00000000ffff')).toThrow(
      expect.objectContaining({ statusCode: 404 }),
    )
  })

  it('reenvio recusa pedido sem e-mail', () => {
    const { orders, service, orderId } = setup(undefined)
    orders.markPaid(orderId)
    expect(() => service.resend(orderId)).toThrow(
      expect.objectContaining({ code: 'EMAIL_NO_RECIPIENT', statusCode: 409 }),
    )
  })
})
```

- [ ] **Passo 2: confirmar falha**

Run: `npx vitest run server/domains/ticket-emails/ticket-email-service.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Passo 3: implementação**

`server/domains/ticket-emails/ticket-email-service.ts`:

```ts
import { DomainError } from '../../shared/errors.js'
import { MailDeliveryError, type MailGateway } from '../accounts/mail-gateway.js'
import type { OrderRepository } from '../orders/order-repository.js'
import { buildTicketCards } from './ticket-card.js'
import { renderTicketCardEmail } from './ticket-card-email.js'
import { renderTicketCardsPdf } from './ticket-card-pdf.js'
import type { TicketEmailRepository } from './ticket-email-repository.js'

// Espera antes da 2ª, 3ª, 4ª e 5ª tentativas; a 5ª falha encerra.
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000]

export class TicketEmailService {
  constructor(
    private readonly repository: TicketEmailRepository,
    private readonly orders: OrderRepository,
    private readonly mail: MailGateway,
    private readonly appUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async processNext() {
    const claimed = this.repository.claimNext()
    if (!claimed) return false
    const order = this.orders.get(claimed.orderId)
    const to = order?.customer.email
    if (!order || !to) {
      this.repository.markNoRecipient(claimed.orderId)
      return true
    }
    try {
      const document = buildTicketCards(order, this.appUrl)
      const pdf = await renderTicketCardsPdf(document)
      await this.mail.send({
        to,
        ...renderTicketCardEmail(document),
        attachments: [
          {
            filename: `bilhetes-${document.orderShortId}.pdf`,
            content: pdf,
            contentType: 'application/pdf',
          },
        ],
      })
      this.repository.markSent(order.id)
    } catch (error) {
      const attempts = claimed.attempts + 1
      const delay = RETRY_DELAYS_MS[attempts - 1]
      this.repository.markFailedAttempt(
        order.id,
        attempts,
        delay === undefined ? null : new Date(this.now().getTime() + delay),
        error instanceof MailDeliveryError
          ? error.summary
          : error instanceof Error
            ? error.message
            : 'Falha desconhecida',
      )
    }
    return true
  }

  // Rodada do worker: vários envios por vez para a fila não crescer em picos de venda.
  async processPending(limit = 10) {
    let processed = 0
    while (processed < limit && (await this.processNext())) processed += 1
    return processed
  }

  resend(orderId: string) {
    const order = this.orders.get(orderId)
    if (!order) throw new DomainError('Pedido nao encontrado.', 404)
    if (order.status !== 'paid') {
      throw new DomainError(
        'Só pedidos pagos recebem o e-mail dos bilhetes.',
        409,
        'ORDER_NOT_PAID',
      )
    }
    if (!order.customer.email) {
      throw new DomainError('Este pedido não tem e-mail cadastrado.', 409, 'EMAIL_NO_RECIPIENT')
    }
    if (this.repository.get(orderId)?.status === 'pending') {
      throw new DomainError(
        'O e-mail deste pedido já está na fila de envio.',
        409,
        'EMAIL_ALREADY_QUEUED',
      )
    }
    this.repository.requeue(orderId)
  }

  statusesOf(orderIds: string[]) {
    return this.repository.getStatuses(orderIds)
  }
}
```

- [ ] **Passo 4: worker em `server/app.ts`**

Importar `TicketEmailRepository` e `TicketEmailService` de `./domains/ticket-emails/...`. Logo depois de `const orderRepository = new OrderRepository(database, now)`:

```ts
const ticketEmails = new TicketEmailService(
  new TicketEmailRepository(database, now),
  orderRepository,
  mail,
  env.PUBLIC_APP_URL,
  now,
)
```

No `setInterval` do worker, acrescentar (rodadas sobrepostas não duplicam envio: o item fica reservado por 10 min):

```ts
void ticketEmails.processPending().catch((error: unknown) => app.log.error(error))
```

- [ ] **Passo 5: confirmar que passa**

Run: `npx vitest run server && npx tsc -p tsconfig.server.json --noEmit`
Expected: PASS.

- [ ] **Passo 6: commit**

```bash
git add server/domains/ticket-emails/ticket-email-service.ts server/domains/ticket-emails/ticket-email-service.test.ts server/app.ts
git commit -m "feat(server): envio do e-mail dos bilhetes com novas tentativas no worker"
```

---

### Tarefa 7: Status e reenvio no backend do painel

**Arquivos:**

- Modificar: `server/domains/admin/admin-sales-service.ts`
- Modificar: `server/http/admin-presenter.ts`
- Modificar: `server/http/admin-routes.ts:167-197`
- Modificar: `server/app.ts:178-184`
- Teste: `server/http/admin-sales-routes.test.ts`

**Interfaces:**

- Consome: `TicketEmailService` (Tarefa 6), `TicketEmailStatus` (Tarefa 1).
- Produz: `presentAdminOrder(order: Order, emailStatus?: TicketEmailStatus)` com campo opcional `emailStatus`; `AdminSalesService` com `listOrders` devolvendo também `emailStatuses: Map<string, TicketEmailStatus>`, `emailStatusOf(orderId): TicketEmailStatus | undefined`, `resendEmail(actor, orderId, reason): Order`; rota `POST /api/v1/admin/orders/:id/resend-email` com corpo `{ reason }` (mín. 5) que responde `{ order }`; ação de auditoria `order.resend_email`.

- [ ] **Passo 1: testes que falham**

Acrescentar ao `describe('admin sales', ...)` de `server/http/admin-sales-routes.test.ts`:

```ts
it('mostra o status do e-mail dos bilhetes e reenvia pedido pago', async () => {
  const { app, headers, createOrder } = await setup()
  const orderId = await createOrder('maria', ['card-001'])

  const list = async () =>
    (await app.inject({ method: 'GET', url: '/api/v1/admin/orders', headers })).json<{
      orders: Array<{ id: string; emailStatus?: string }>
    }>().orders[0]

  expect(await list()).not.toHaveProperty('emailStatus')

  const approved = await app.inject({
    method: 'POST',
    url: `/api/v1/admin/orders/${orderId}/approve`,
    headers,
    payload: { reason: 'Pix recebido direto na conta' },
  })
  expect(approved.json()).toMatchObject({ order: { status: 'paid', emailStatus: 'pending' } })

  const queued = await app.inject({
    method: 'POST',
    url: `/api/v1/admin/orders/${orderId}/resend-email`,
    headers,
    payload: { reason: 'Cliente não recebeu' },
  })
  expect(queued.statusCode).toBe(409)
  expect(queued.json()).toMatchObject({ code: 'EMAIL_ALREADY_QUEUED' })
  expect(await list()).toMatchObject({ id: orderId, emailStatus: 'pending' })
})

it('recusa reenvio de pedido não pago e sem motivo', async () => {
  const { app, headers, createOrder } = await setup()
  const orderId = await createOrder('maria', ['card-001'])
  const noReason = await app.inject({
    method: 'POST',
    url: `/api/v1/admin/orders/${orderId}/resend-email`,
    headers,
    payload: { reason: 'ok' },
  })
  expect(noReason.statusCode).toBe(400)
  const pending = await app.inject({
    method: 'POST',
    url: `/api/v1/admin/orders/${orderId}/resend-email`,
    headers,
    payload: { reason: 'Cliente não recebeu' },
  })
  expect(pending.json()).toMatchObject({ code: 'ORDER_NOT_PAID' })
})
```

O caminho feliz do reenvio (`sent` → `pending`) já está coberto na Tarefa 6; aqui a rota é exercitada pelos 409/400 e pela E2E da Tarefa 9.

- [ ] **Passo 2: confirmar falha**

Run: `npx vitest run server/http/admin-sales-routes.test.ts`
Expected: FAIL (sem `emailStatus`; rota 404).

- [ ] **Passo 3: implementação**

`server/http/admin-presenter.ts` — assinatura e campo:

```ts
import type { Order } from '../domains/orders/order-types.js'
import type { TicketEmailStatus } from '../domains/ticket-emails/ticket-email-repository.js'

// Visão administrativa: inclui dados pessoais completos; servida só com sessão de admin.
export function presentAdminOrder(order: Order, emailStatus?: TicketEmailStatus) {
  return {
    id: order.id,
    status: order.status,
    // ...campos atuais sem mudança...
    ...(emailStatus ? { emailStatus } : {}),
  }
}
```

`server/domains/admin/admin-sales-service.ts` — importar `TicketEmailService`; novo parâmetro do construtor logo depois de `orderService`: `private readonly ticketEmails: TicketEmailService,`. Trocar `listOrders` e acrescentar dois métodos:

```ts
  listOrders(filters: SalesFilters, page: Page) {
    this.orders.expirePending()
    const result = this.sales.searchOrders(filters, page)
    return {
      ...result,
      emailStatuses: this.ticketEmails.statusesOf(result.orders.map((order) => order.id)),
    }
  }

  emailStatusOf(orderId: string) {
    return this.ticketEmails.statusesOf([orderId]).get(orderId)
  }

  resendEmail(actor: AdminSession, orderId: string, reason: string) {
    this.ticketEmails.resend(orderId)
    this.record(actor, 'order.resend_email', orderId, { reason })
    return this.requireOrder(orderId)
  }
```

`server/http/admin-routes.ts`:

```ts
protectedScope.get(`${ADMIN_PREFIX}/orders`, async (request) => {
  const { page, filters } = splitPage(request.query)
  const result = services.sales.listOrders(salesFiltersSchema.parse(filters), page)
  return {
    ...page,
    total: result.total,
    orders: result.orders.map((order) =>
      presentAdminOrder(order, result.emailStatuses.get(order.id)),
    ),
  }
})
```

Nas rotas `approve` e `cancel`, trocar `return { order: presentAdminOrder(order) }` por `return { order: presentAdminOrder(order, services.sales.emailStatusOf(order.id)) }`. Depois da rota `cancel`:

```ts
protectedScope.post(`${ADMIN_PREFIX}/orders/:id/resend-email`, async (request) => {
  const { id } = orderParamsSchema.parse(request.params)
  const { reason } = orderActionInputSchema.parse(request.body)
  const order = services.sales.resendEmail(requireAdminSession(request), id, reason)
  return { order: presentAdminOrder(order, services.sales.emailStatusOf(order.id)) }
})
```

`server/app.ts` — `new AdminSalesService(new AdminSalesRepository(database), orderRepository, service, ticketEmails, adminRepository, now)`.

- [ ] **Passo 4: confirmar que passa**

Run: `npx vitest run server && npx tsc -p tsconfig.server.json --noEmit`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add server/domains/admin/admin-sales-service.ts server/http/admin-presenter.ts server/http/admin-routes.ts server/app.ts server/http/admin-sales-routes.test.ts
git commit -m "feat(server): status e reenvio do e-mail dos bilhetes no painel"
```

---

### Tarefa 8: Coluna "E-mail" e ação "Reenviar e-mail" no painel

**Arquivos:**

- Modificar: `src/shared/config/api-routes.ts:35`
- Modificar: `src/features/admin/api/schemas.ts` (`adminOrderSchema`)
- Modificar: `src/features/admin/domain/types.ts` (`AdminOrder`, `OrderAction`)
- Modificar: `src/features/admin/service/order-labels.ts`
- Modificar: `src/features/admin/ui/OrderActionDialog.tsx`
- Modificar: `src/pages/admin/AdminSalesPage.tsx`
- Teste: `src/pages/admin/AdminPages.test.tsx`

**Interfaces:**

- Consome: campo `emailStatus` e rota `resend-email` (Tarefa 7).
- Produz: `type EmailStatus = 'pending' | 'sent' | 'failed' | 'no_recipient'`; `OrderAction = 'approve' | 'cancel' | 'resend-email'`; `emailStatusLabels`, `emailStatusTones`, `canResendEmail(order)`.

- [ ] **Passo 1: teste que falha**

Acrescentar ao `describe('AdminSalesPage', ...)` em `src/pages/admin/AdminPages.test.tsx`:

```tsx
it('mostra o status do e-mail e reenvia com motivo', async () => {
  const paidOrder: AdminOrder = { ...pendingOrder, status: 'paid', emailStatus: 'failed' }
  repository.listOrders.mockResolvedValue({ page: 1, pageSize: 20, total: 1, orders: [paidOrder] })
  repository.runOrderAction.mockResolvedValue({ ...paidOrder, emailStatus: 'pending' })
  renderAdmin('/admin/vendas')

  expect(await screen.findByText('Falhou')).toBeInTheDocument()
  await userEvent.click(
    screen.getByRole('button', { name: 'Reenviar e-mail do pedido de Maria da Silva' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Reenviar e-mail dos bilhetes' })
  await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Cliente não recebeu')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reenviar' }))

  expect(repository.runOrderAction).toHaveBeenCalledWith(
    paidOrder.id,
    'resend-email',
    'Cliente não recebeu',
  )
  expect(await screen.findByText('E-mail colocado na fila de envio.')).toBeInTheDocument()
})

it('não oferece reenvio para pedido sem e-mail ou já na fila', async () => {
  repository.listOrders.mockResolvedValue({
    page: 1,
    pageSize: 20,
    total: 2,
    orders: [
      { ...pendingOrder, status: 'paid', emailStatus: 'no_recipient' },
      {
        ...pendingOrder,
        id: '11111111-0000-4000-8000-000000000002',
        status: 'paid',
        emailStatus: 'pending',
      },
    ],
  })
  renderAdmin('/admin/vendas')

  expect(await screen.findByText('Sem e-mail')).toBeInTheDocument()
  expect(screen.getByText('Na fila')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Reenviar e-mail/ })).not.toBeInTheDocument()
})
```

- [ ] **Passo 2: confirmar falha**

Run: `npx vitest run src/pages/admin/AdminPages.test.tsx`
Expected: FAIL (tipo `emailStatus` inexistente / texto não encontrado).

- [ ] **Passo 3: implementação**

`src/shared/config/api-routes.ts`:

```ts
  adminOrderAction: (orderId: string, action: 'approve' | 'cancel' | 'resend-email') =>
```

`src/features/admin/api/schemas.ts` — em `adminOrderSchema`, depois de `lastError`:

```ts
  emailStatus: z.enum(['pending', 'sent', 'failed', 'no_recipient']).optional(),
```

`src/features/admin/domain/types.ts`:

```ts
export type EmailStatus = 'pending' | 'sent' | 'failed' | 'no_recipient'
```

Em `AdminOrder`, depois de `lastError?: string`: `emailStatus?: EmailStatus`. Trocar `export type OrderAction = 'approve' | 'cancel'` por `export type OrderAction = 'approve' | 'cancel' | 'resend-email'`.

`src/features/admin/service/order-labels.ts` — importar `EmailStatus` e acrescentar:

```ts
export const emailStatusLabels: Record<EmailStatus, string> = {
  pending: 'Na fila',
  sent: 'Enviado',
  failed: 'Falhou',
  no_recipient: 'Sem e-mail',
}

export const emailStatusTones: Record<EmailStatus, BadgeTone> = {
  pending: 'info',
  sent: 'success',
  failed: 'danger',
  no_recipient: 'neutral',
}

// Pedido pago antes da fila existir não tem status e também pode receber o e-mail.
export function canResendEmail(order: AdminOrder) {
  return (
    order.status === 'paid' &&
    order.emailStatus !== 'pending' &&
    order.emailStatus !== 'no_recipient'
  )
}
```

`src/features/admin/ui/OrderActionDialog.tsx` — no início de `describe`:

```ts
if (action === 'resend-email') {
  return 'Os bilhetes serão enviados de novo para o e-mail do pedido, com o PDF em anexo.'
}
```

e trocar o cálculo de `title` e `confirmLabel`:

```ts
const title =
  action === 'resend-email'
    ? 'Reenviar e-mail dos bilhetes'
    : action === 'cancel'
      ? 'Cancelar pedido'
      : order?.status === 'manual_review'
        ? 'Tentar entregar novamente'
        : 'Aprovar pagamento manualmente'
const confirmLabel =
  action === 'resend-email' ? 'Reenviar' : action === 'cancel' ? 'Cancelar pedido' : 'Aprovar'
```

usando `confirmLabel={confirmLabel}` no `ConfirmDialog`.

`src/pages/admin/AdminSalesPage.tsx`:

- importar `Mail` de `lucide-react`, `canResendEmail`, `emailStatusLabels`, `emailStatusTones`;
- `describeOutcome(order, action)`: primeira linha `if (action === 'resend-email') return { tone: 'success' as const, text: 'E-mail colocado na fila de envio.' }`; no `onSuccess`, chamar `setNotice(describeOutcome(order, target.action))`;
- nova coluna depois de `status`:

```tsx
    {
      key: 'email',
      header: 'E-mail',
      render: (order) =>
        order.emailStatus ? (
          <StatusBadge tone={emailStatusTones[order.emailStatus]}>
            {emailStatusLabels[order.emailStatus]}
          </StatusBadge>
        ) : (
          <span className="admin-hint">—</span>
        ),
    },
```

- na coluna `actions`, condição `canApprove(order) || canCancel(order) || canResendEmail(order)` e, depois do botão de cancelar:

```tsx
{
  canResendEmail(order) ? (
    <button
      type="button"
      className="admin-icon-button"
      aria-label={`Reenviar e-mail do pedido de ${order.customer.name}`}
      title="Reenviar e-mail"
      onClick={() => openAction(order, 'resend-email')}
    >
      <Mail size={16} aria-hidden="true" />
    </button>
  ) : null
}
```

- [ ] **Passo 4: confirmar que passa**

Run: `npx vitest run src/pages/admin && npm run lint && npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add src/shared/config/api-routes.ts src/features/admin src/pages/admin
git commit -m "feat(web): status do e-mail dos bilhetes e reenvio no painel de vendas"
```

---

### Tarefa 9: E2E, documentação e verificação final

**Arquivos:**

- Modificar: `tests/e2e/admin-sales.spec.ts`
- Modificar: `docs/API_CONTRACTS.md`, `docs/SECURITY.md`, `docs/PRODUCT.md`, `ARCHITECTURE.md`
- Mover: este plano para `docs/exec-plans/completed/` ao fim.

**Interfaces:**

- Consome: tudo acima. O backend do E2E roda o worker (a cada 5 s) com `MAIL_PROVIDER=mock`.

- [ ] **Passo 1: E2E**

Em `tests/e2e/admin-sales.spec.ts`, novo teste:

```ts
test('envia o e-mail dos bilhetes do pedido aprovado e permite reenviar', async ({ page }) => {
  const card = await createPendingOrder(page)
  const code = card.replace('card-', '#')

  await signIn(page, `/admin/vendas?status=pending&q=${encodeURIComponent(code)}`)
  await page.getByRole('button', { name: 'Aprovar pedido de João Souza' }).click()
  const approve = page.getByRole('dialog', { name: 'Aprovar pagamento manualmente' })
  await approve.getByLabel('Motivo').fill('Pix recebido direto na conta')
  await approve.getByRole('button', { name: 'Aprovar' }).click()
  await expect(page.getByText('Pedido aprovado e bilhetes validados.')).toBeVisible()

  await expect(async () => {
    await page.goto(`/admin/vendas?q=${encodeURIComponent(code)}`)
    await expect(page.getByText('Enviado')).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 30_000 })

  await page.getByRole('button', { name: 'Reenviar e-mail do pedido de João Souza' }).click()
  const resend = page.getByRole('dialog', { name: 'Reenviar e-mail dos bilhetes' })
  await resend.getByLabel('Motivo').fill('Cliente não recebeu')
  await resend.getByRole('button', { name: 'Reenviar' }).click()
  await expect(page.getByText('E-mail colocado na fila de envio.')).toBeVisible()
})
```

Run: `npx playwright test tests/e2e/admin-sales.spec.ts --project=chromium`
Expected: PASS.

- [ ] **Passo 2: documentação**

- `docs/API_CONTRACTS.md`: na seção do painel, `POST /api/v1/admin/orders/:id/resend-email` (corpo `{ reason }` com 5–500 caracteres; `200 { order }`; `409 ORDER_NOT_PAID`, `EMAIL_NO_RECIPIENT`, `EMAIL_ALREADY_QUEUED`; `404`) e o campo opcional `emailStatus` (`pending | sent | failed | no_recipient`) em `AdminOrder`, ausente em pedido nunca pago.
- `docs/SECURITY.md`: nova linha — e-mail dos bilhetes só com o nome no corpo; PDF com nome, cidade e CPF mascarado, gerado em memória e nunca gravado; `order_emails.last_error` e logs só com `code`, `responseCode`, `command`; reenvio só por admin, com motivo na auditoria (`order.resend_email`).
- `docs/PRODUCT.md`: pedido pago envia e-mail com a cartela e PDF; falha tenta de novo em 1 min, 5 min, 30 min e 2 h; painel mostra o status e reenvia.
- `ARCHITECTURE.md`: domínio `server/domains/ticket-emails` (fila em `order_emails`, cartela, HTML, PDF, worker).

- [ ] **Passo 3: verificação completa**

Run: `npm run check && npm run test:e2e`
Expected: tudo verde. Registrar o número de testes no progresso abaixo.

- [ ] **Passo 4: fechar o plano e commit**

Preencher "Progresso" e "Validação", mover o arquivo para `docs/exec-plans/completed/` e:

```bash
git add -A tests/e2e docs ARCHITECTURE.md
git commit -m "docs: e-mail dos bilhetes, contratos e segurança; E2E de reenvio"
```

## Decisões

Ver a tabela da spec. Acrescentada no plano: reenvio aceita pedido pago antes da fila existir (sem registro em `order_emails`), para permitir enviar a cartela de compras antigas.

## Progresso

- 2026-10-17: spec aprovada; plano escrito.
- 2026-10-17: tarefa 1 — fila `order_emails` (migração v9) e enfileiramento no `markPaid` (`dfcc191`).
- 2026-10-17: tarefa 2 — estrutura da cartela de bilhetes (`03d53e3`, com ajuste de teste do comprovante em `76f5e00`).
- 2026-10-17: tarefa 3 — HTML e texto do e-mail com a cartela (`9f88dfe`).
- 2026-10-17: tarefa 4 — PDF com os bilhetes do pedido (`17a1258`, correção de página em `6f3718f`).
- 2026-10-17: tarefa 5 — `MailGateway.send` com anexos (`5b00947`).
- 2026-10-17: tarefa 6 — envio com novas tentativas no worker (`9dcec19`, erro sem dados pessoais em `ea67989`).
- 2026-10-17: tarefa 7 — status e reenvio no painel, backend (`c41b90f`).
- 2026-10-17: tarefa 8 — status e reenvio no painel de vendas, frontend (`193fb57`).
- 2026-10-17: tarefa 9 — E2E, documentação e verificação final (commit `docs: e-mail dos bilhetes, contratos e segurança; E2E de reenvio`).

## Validação

- `npm run check`: passou (lint, Prettier, `validate:architecture`, `validate:docs`, build e 332 testes Vitest em 57 arquivos).
- `npm run test:e2e`: 38 testes passaram (chromium e mobile Pixel 7), inclusive o novo "envia o e-mail dos bilhetes do pedido aprovado e permite reenviar".
