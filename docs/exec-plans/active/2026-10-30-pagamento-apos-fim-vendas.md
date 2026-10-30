# Pagamento após o fim das vendas — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar tarefa por tarefa. Passos usam checkbox (`- [ ]`).

**Objetivo:** bilhete cujo pagamento chegou ao servidor no fim das vendas do concurso ou depois dele não é validado; fica `not_validated` no bilhete, no pedido, em "Minhas compras" e no painel, e as telas avisam o prazo.

**Arquitetura:** o bilhete do pedido guarda `salesEndAt` copiado do concurso. O pedido guarda `payment_received_at` (hora do servidor ao receber a primeira evidência confirmada). Um módulo puro `sales-deadline.ts` decide quais bilhetes estão atrasados; `OrderService` marca esses bilhetes, libera as reservas deles e valida só o restante. O pedido sem nenhum bilhete válido vira `not_validated`. O front só exibe `salesEndAt` e o status vindos do backend.

**Tecnologias:** Fastify 5, `node:sqlite`, Zod 4, React 19, React Query 5, Vitest, Testing Library, Playwright.

**Spec:** [docs/superpowers/specs/2026-10-30-pagamento-apos-fim-vendas-design.md](../../superpowers/specs/2026-10-30-pagamento-apos-fim-vendas-design.md)

## Restrições globais

- TypeScript estrito, sem `any`, sem `as` sobre dado externo; Zod na fronteira.
- Textos de usuário, comentários e documentação em português brasileiro.
- Dinheiro em centavos inteiros.
- Camadas do frontend: `domain → api → repository → service → runtime → ui`; páginas não fazem HTTP.
- Nenhuma decisão de prazo no navegador: o front nunca compara `salesEndAt` com `Date.now()`.
- Bilhete atrasado: `payment_received_at >= salesEndAt`. Bilhete sem `salesEndAt` não é checado.
- Chave de bilhete no pedido: `${item.raffleId ?? order.raffleId}:${item.id}` (mesma das reservas locais).
- `npm run check` ao fim de cada tarefa; `npm run test:e2e` na Tarefa 9.

## Critérios de aceite

- Pagamento recebido antes do fim das vendas segue o fluxo atual.
- Pagamento recebido no fim das vendas ou depois: bilhetes daquele concurso ficam `not_validated`, não vão para `PUT /bilhete/validar`, não entram no e-mail e têm as reservas liberadas.
- Pedido sem nenhum bilhete válido fica `not_validated` (nunca `manual_review` só por atraso); pedido parcial fica `paid` com os atrasados marcados.
- A hora vem do servidor: `payment_events.created_at` do mesmo NSU confirmado, ou hora do redirect, o menor; baixa manual usa a hora do clique.
- Admin não consegue validar bilhete atrasado; vê valor a estornar. Receita do painel exclui bilhetes não validados.
- Pedido de concurso único expira no máximo no fim das vendas.
- Aviso de prazo em `HomePage`, `CartPage`, `PaymentPage` (pendente) e `PurchasesPage`; selo "Não validado" em pedido e bilhete.

## Mapa de arquivos

Backend:

- `server/domains/orders/order-types.ts` — `salesEndAt`, `validationStatus`, status `not_validated`, `paymentReceivedAt`.
- `server/domains/orders/sales-deadline.ts` (novo) — regras puras; teste `sales-deadline.test.ts`.
- `server/shared/database-migrations.ts` — v10 (`orders.payment_received_at`).
- `server/domains/orders/order-repository.ts` — gravação da hora, marcação de bilhetes, status `not_validated`.
- `server/domains/orders/remote-reservation-repository.ts`, `ticket-reservation-coordinator.ts` — liberar reservas por bilhete; ignorar bilhetes não validados.
- `server/domains/orders/order-service.ts` — regra em `reconcile`, `approvePending`, `retryManualReview`; `expiresAt` de concurso único.
- `server/http/order-presenter.ts`, `server/http/admin-presenter.ts` — campos novos.
- `server/domains/ticket-emails/ticket-card.ts` — só bilhetes validados.
- `server/domains/admin/admin-dashboard-repository.ts`, `admin-dashboard-service.ts`, `admin-sales-service.ts` — receita, total a estornar, rótulo.

Frontend:

- `src/shared/lib/sales-deadline.ts` (novo) — texto do aviso.
- `src/shared/ui/SalesDeadlineNotice.tsx` (novo) — componente do aviso.
- `src/features/raffle/{api/schemas.ts,domain/types.ts,repository/raffle-repository.ts}` — `salesEndAt`.
- `src/features/cart/{domain/types.ts,runtime/CartProvider.tsx}` — `salesEndAt` na entrada.
- `src/features/checkout/{api/schemas.ts,domain/types.ts}` — status, `salesEndAt`, `validationStatus`, `refundDueInCents`.
- `src/features/purchases/service/purchase-labels.ts` — rótulo novo.
- `src/features/admin/{api/schemas.ts,domain/types.ts,service/order-labels.ts,service/list-params.ts}` — status, campos.
- `src/pages/{HomePage,CartPage,PaymentPage,PurchasesPage}.tsx`, `src/pages/admin/{AdminSalesPage,AdminHomePage}.tsx`.

Docs: `docs/API_CONTRACTS.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `AGENTS.md` (se listar estados).

---

### Tarefa 1: tipos e regras puras de prazo

**Arquivos:**

- Modificar: `server/domains/orders/order-types.ts`
- Criar: `server/domains/orders/sales-deadline.ts`
- Teste: `server/domains/orders/sales-deadline.test.ts`

**Interfaces produzidas:**

- `ticketSchema` ganha `salesEndAt?: string` (ISO) e `validationStatus?: 'not_validated'`.
- `orderStatusSchema` ganha `'not_validated'`; `orderSchema` ganha `paymentReceivedAt?: string`.
- `ticketKey(order: Pick<Order, 'raffleId'>, item: Ticket): string`
- `isNotValidated(item: Ticket): boolean`
- `validatedItems(order: Order): Ticket[]`
- `lateTicketKeys(order: Order, receivedAt: string): string[]`
- `refundDueInCents(order: Order): number`

- [ ] **Passo 1: teste que falha**

```ts
// server/domains/orders/sales-deadline.test.ts
import { describe, expect, it } from 'vitest'
import { order, ticket } from './order-test-fixtures.js'
import { lateTicketKeys, refundDueInCents, ticketKey, validatedItems } from './sales-deadline.js'

const deadline = '2026-09-27T22:00:00.000Z'

describe('prazo de vendas', () => {
  it('marca como atrasado o bilhete pago no fim das vendas ou depois', () => {
    const late = order({ items: [{ ...ticket('card-001'), salesEndAt: deadline }] })
    expect(lateTicketKeys(late, '2026-09-27T21:59:59.999Z')).toEqual([])
    expect(lateTicketKeys(late, deadline)).toEqual(['sorteio-setembro:card-001'])
    expect(lateTicketKeys(late, '2026-09-28T10:00:00.000Z')).toEqual(['sorteio-setembro:card-001'])
  })

  it('não checa bilhete sem fim de vendas', () => {
    expect(lateTicketKeys(order(), '2030-01-01T00:00:00.000Z')).toEqual([])
  })

  it('separa por concurso em pedido agrupado', () => {
    const grouped = order({
      items: [
        { ...ticket('card-001'), raffleId: 'cap', salesEndAt: deadline, unitPriceInCents: 1000 },
        {
          ...ticket('card-001'),
          raffleId: 'esp',
          salesEndAt: '2026-10-01T22:00:00.000Z',
          unitPriceInCents: 600,
        },
      ],
      totalInCents: 1600,
    })
    expect(lateTicketKeys(grouped, '2026-09-28T00:00:00.000Z')).toEqual(['cap:card-001'])
  })

  it('soma o valor a estornar e filtra os validados', () => {
    const partial = order({
      items: [
        { ...ticket('card-001'), validationStatus: 'not_validated', unitPriceInCents: 1000 },
        { ...ticket('card-002'), unitPriceInCents: 1000 },
      ],
      totalInCents: 2000,
    })
    expect(refundDueInCents(partial)).toBe(1000)
    expect(validatedItems(partial).map((item) => item.id)).toEqual(['card-002'])
    expect(ticketKey(partial, ticket('card-002'))).toBe('sorteio-setembro:card-002')
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run server/domains/orders/sales-deadline.test.ts`
Esperado: FAIL, módulo `./sales-deadline.js` não encontrado.

- [ ] **Passo 3: tipos**

Em `order-types.ts`, dentro de `ticketSchema`, após `luckySpins`:

```ts
  // Fim das vendas do concurso, copiado na criação. Pagamento recebido a partir dele não valida.
  salesEndAt: z.iso.datetime().optional(),
  validationStatus: z.literal('not_validated').optional(),
```

Em `orderStatusSchema`, acrescentar `'not_validated'` ao fim da lista. Em `orderSchema`, após `paidAt`:

```ts
  paymentReceivedAt: z.iso.datetime().optional(),
```

- [ ] **Passo 4: regras**

```ts
// server/domains/orders/sales-deadline.ts
import type { Order, Ticket } from './order-types.js'

// Mesma chave das reservas locais: um pedido agrupado pode ter o mesmo número nos dois concursos.
export function ticketKey(order: Pick<Order, 'raffleId'>, item: Ticket) {
  return `${item.raffleId ?? order.raffleId}:${item.id}`
}

export function isNotValidated(item: Ticket) {
  return item.validationStatus === 'not_validated'
}

export function validatedItems(order: Order) {
  return order.items.filter((item) => !isNotValidated(item))
}

// Bilhete sem fim de vendas (pedido antigo ou concurso mock) não é checado.
export function lateTicketKeys(order: Order, receivedAt: string) {
  const received = Date.parse(receivedAt)
  return order.items
    .filter((item) => item.salesEndAt !== undefined && received >= Date.parse(item.salesEndAt))
    .map((item) => ticketKey(order, item))
}

export function refundDueInCents(order: Order) {
  return order.items
    .filter(isNotValidated)
    .reduce((sum, item) => sum + (item.unitPriceInCents ?? order.unitPriceInCents), 0)
}
```

- [ ] **Passo 5: rodar e ver passar**

Rodar: `npx vitest run server/domains/orders/sales-deadline.test.ts`
Esperado: PASS. Rodar `npx tsc -p tsconfig.server.json --noEmit` (ou o `typecheck` do `package.json`) e corrigir os `Record<Order['status'], ...>` que passam a exigir `not_validated`: em `server/domains/admin/admin-sales-service.ts` acrescentar `not_validated: 'Não validado'` a `STATUS_LABELS`; em `server/domains/admin/admin-dashboard-service.ts` acrescentar `'not_validated'` à lista de status (linha ~12).

- [ ] **Passo 6: commit**

```bash
git add server/domains/orders/order-types.ts server/domains/orders/sales-deadline.ts server/domains/orders/sales-deadline.test.ts server/domains/admin/admin-sales-service.ts server/domains/admin/admin-dashboard-service.ts
git commit -m "feat(server): regras de prazo de vendas por bilhete"
```

---

### Tarefa 2: migração v10 e repositório de pedidos

**Arquivos:**

- Modificar: `server/shared/database-migrations.ts`, `server/shared/database.test.ts`
- Modificar: `server/domains/orders/order-repository.ts`
- Teste: `server/domains/orders/order-repository.test.ts` (novo)

**Interfaces:**

- Consome: `ticketKey`, `isNotValidated` (Tarefa 1).
- Produz em `OrderRepository`:
  - `findPaymentEventReceivedAt(transactionNsu: string, invoiceSlug: string): string | null`
  - `firstPaymentEventAt(orderId: string): string | null`
  - `recordPaymentReceivedAt(orderId: string, receivedAt: string): string` — grava o menor e devolve o gravado.
  - `markItemsNotValidated(orderId: string, keys: string[]): void` — marca itens e apaga as reservas locais deles.
  - `markNotValidated(orderId: string): void` — status `not_validated`, `paid_at` se vazio, apaga reservas locais.
  - `mapOrder` lê `payment_received_at`.

- [ ] **Passo 1: migração (teste primeiro)**

Em `database.test.ts`, trocar as duas expectativas `user_version: 9` por `10` e acrescentar:

```ts
it('adiciona payment_received_at aos pedidos', () => {
  const database = createDatabase(':memory:')
  const columns = database.prepare('PRAGMA table_info(orders)').all() as Array<{ name: string }>
  expect(columns.map((column) => column.name)).toContain('payment_received_at')
  database.close()
})
```

Rodar `npx vitest run server/shared/database.test.ts` — FAIL.

Em `database-migrations.ts`: `CURRENT_SCHEMA_VERSION = 10`, `if (version < 10) migrateToVersion10(database)` após a linha da v9, e:

```ts
function migrateToVersion10(database: DatabaseSync) {
  if (!tableColumns(database, 'orders').includes('payment_received_at')) {
    database.exec('ALTER TABLE orders ADD COLUMN payment_received_at TEXT')
  }
}
```

Conferir a assinatura real de `tableColumns` no arquivo (linha ~131) e adaptar se devolver `Set`. Rodar de novo — PASS.

- [ ] **Passo 2: teste do repositório que falha**

```ts
// server/domains/orders/order-repository.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type AppDatabase } from '../../shared/database.js'
import { OrderRepository } from './order-repository.js'
import { order, ticket } from './order-test-fixtures.js'

let database: AppDatabase
const now = () => new Date('2026-09-23T10:05:00.000Z')

afterEach(() => database.close())

function setup() {
  database = createDatabase(':memory:')
  const repository = new OrderRepository(database, now)
  const created = repository.createManual(
    order({ items: [ticket('card-001'), ticket('card-002')], totalInCents: 2000 }),
  )
  return { repository, created }
}

describe('OrderRepository e prazo de vendas', () => {
  it('guarda o menor horário de recebimento', () => {
    const { repository, created } = setup()
    expect(repository.recordPaymentReceivedAt(created.id, '2026-09-23T10:03:00.000Z')).toBe(
      '2026-09-23T10:03:00.000Z',
    )
    expect(repository.recordPaymentReceivedAt(created.id, '2026-09-23T10:04:00.000Z')).toBe(
      '2026-09-23T10:03:00.000Z',
    )
    expect(repository.recordPaymentReceivedAt(created.id, '2026-09-23T10:01:00.000Z')).toBe(
      '2026-09-23T10:01:00.000Z',
    )
    expect(repository.get(created.id)?.paymentReceivedAt).toBe('2026-09-23T10:01:00.000Z')
  })

  it('acha a hora de chegada do webhook pelo NSU', () => {
    const { repository, created } = setup()
    repository.enqueuePaymentEvent({
      invoice_slug: 'slug-1',
      amount: 2000,
      paid_amount: 2000,
      installments: 1,
      capture_method: 'pix',
      transaction_nsu: 'nsu-1',
      order_nsu: created.id,
      receipt_url: 'https://example.com/r',
      items: [],
    })
    expect(repository.findPaymentEventReceivedAt('nsu-1', 'slug-1')).toBe(now().toISOString())
    expect(repository.findPaymentEventReceivedAt('nsu-x', 'slug-1')).toBeNull()
    expect(repository.firstPaymentEventAt(created.id)).toBe(now().toISOString())
  })

  it('marca bilhetes não validados e libera a reserva local deles', () => {
    const { repository, created } = setup()
    repository.markItemsNotValidated(created.id, ['sorteio-setembro:card-001'])
    const updated = repository.get(created.id)
    expect(updated?.items.map((item) => item.validationStatus)).toEqual([
      'not_validated',
      undefined,
    ])
    expect(repository.isReserved('sorteio-setembro:card-001')).toBe(false)
    expect(repository.isReserved('sorteio-setembro:card-002')).toBe(true)
  })

  it('marca o pedido como não validado', () => {
    const { repository, created } = setup()
    repository.markNotValidated(created.id)
    const updated = repository.get(created.id)
    expect(updated).toMatchObject({ status: 'not_validated', paidAt: now().toISOString() })
    expect(repository.isReserved('sorteio-setembro:card-002')).toBe(false)
  })

  it('não atribui posição de lote a bilhete não validado', () => {
    const { repository, created } = setup()
    repository.markItemsNotValidated(created.id, ['sorteio-setembro:card-001'])
    repository.assignBatchPositions(created.id)
    const [late, valid] = repository.get(created.id)?.items ?? []
    expect(late?.validationBatch).toBe('mock')
    expect(valid).toMatchObject({ validationBatch: '84734', batchPosition: 1 })
  })
})
```

Rodar `npx vitest run server/domains/orders/order-repository.test.ts` — FAIL.

- [ ] **Passo 3: implementação no repositório**

Em `order-repository.ts`, importar `isNotValidated` e `ticketKey` de `./sales-deadline.js` e acrescentar após `recordPaymentEvidence`:

```ts
  findPaymentEventReceivedAt(transactionNsu: string, invoiceSlug: string) {
    const row = this.database
      .prepare(
        'SELECT created_at FROM payment_events WHERE transaction_nsu = ? AND invoice_slug = ?',
      )
      .get(transactionNsu, invoiceSlug) as { created_at: string } | undefined
    return row?.created_at ?? null
  }

  firstPaymentEventAt(orderId: string) {
    const row = this.database
      .prepare('SELECT MIN(created_at) AS created_at FROM payment_events WHERE order_id = ?')
      .get(orderId) as { created_at: string | null } | undefined
    return row?.created_at ?? null
  }

  // Datas ISO em UTC comparam como texto; vale sempre a primeira evidência recebida.
  recordPaymentReceivedAt(orderId: string, receivedAt: string) {
    this.database
      .prepare(
        `UPDATE orders SET payment_received_at = MIN(COALESCE(payment_received_at, ?), ?)
         WHERE id = ?`,
      )
      .run(receivedAt, receivedAt, orderId)
    const row = this.database
      .prepare('SELECT payment_received_at FROM orders WHERE id = ?')
      .get(orderId) as { payment_received_at: string }
    return row.payment_received_at
  }

  markItemsNotValidated(orderId: string, keys: string[]) {
    if (keys.length === 0) return
    const wanted = new Set(keys)
    this.withReservationTransaction(() => {
      const row = this.database
        .prepare('SELECT raffle_id, items_json FROM orders WHERE id = ?')
        .get(orderId) as { raffle_id: string; items_json: string } | undefined
      if (!row) return
      const current = mapItems(row.items_json)
      const items = current.map((item) =>
        wanted.has(ticketKey({ raffleId: row.raffle_id }, item))
          ? { ...item, validationStatus: 'not_validated' as const }
          : item,
      )
      this.database
        .prepare('UPDATE orders SET items_json = ? WHERE id = ?')
        .run(JSON.stringify(items), orderId)
      const remove = this.database.prepare(
        'DELETE FROM reservations WHERE order_id = ? AND ticket_key = ?',
      )
      for (const key of wanted) remove.run(orderId, key)
    })
  }

  // Dinheiro recebido sem bilhete válido: não é sucesso nem análise; o valor é estornado fora.
  markNotValidated(orderId: string) {
    this.withReservationTransaction(() => {
      this.database
        .prepare(
          `UPDATE orders SET status = 'not_validated', paid_at = COALESCE(paid_at, ?),
             last_error = NULL
           WHERE id = ? AND status <> 'paid'`,
        )
        .run(this.now().toISOString(), orderId)
      this.database.prepare('DELETE FROM reservations WHERE order_id = ?').run(orderId)
    })
  }
```

Ao fim do arquivo, junto de `mapOrder`:

```ts
function mapItems(itemsJson: string) {
  return orderSchema.shape.items.parse(JSON.parse(itemsJson))
}
```

Em `mapOrder`, acrescentar `paymentReceivedAt: row.payment_received_at ?? undefined,`.

Em `assignBatchPositions`, trocar o `items.map(...)` para não tocar bilhete não validado:

```ts
const updatedItems = items.map((item) =>
  item.validationStatus === 'not_validated' ||
  (item.validationBatch === '84734' &&
    typeof item.batchPosition === 'number' &&
    item.batchPosition > 0)
    ? item
    : { ...item, validationBatch: '84734', batchPosition: currentPosition++ },
)
```

Em `claimManualReviewRetry`, tipar `items` com `validationStatus?: string` e pular os não validados no laço (`if (item.validationStatus === 'not_validated') continue`). Mantém `isNotValidated` importado só se usado; senão, importar só `ticketKey`.

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run server/domains/orders server/shared/database.test.ts`
Esperado: PASS, inclusive os testes existentes.

- [ ] **Passo 5: commit**

```bash
git add server/shared/database-migrations.ts server/shared/database.test.ts server/domains/orders/order-repository.ts server/domains/orders/order-repository.test.ts
git commit -m "feat(server): migração v10 e marcação de bilhetes não validados"
```

---

### Tarefa 3: reservas externas por bilhete

**Arquivos:**

- Modificar: `server/domains/orders/remote-reservation-repository.ts`, `server/domains/orders/ticket-reservation-coordinator.ts`
- Teste: `server/domains/orders/ticket-reservation-coordinator.test.ts`, `server/shared/database.test.ts`

**Interfaces:**

- Consome: `validatedItems`, `ticketKey` (Tarefa 1); `markItemsNotValidated`, `markNotValidated` (Tarefa 2).
- Produz: `TicketReservationCoordinator.releaseTickets(orderId: string, keys: string[]): Promise<void>` (chaves no formato `raffleId:ticketNumber`). `confirmOwnership` passa a considerar só bilhetes validados. `listAbandoned` inclui pedidos `not_validated` e bilhetes não validados de pedidos pagos. `markOrderValidated` não marca bilhete não validado.

- [ ] **Passo 1: testes que falham**

Em `ticket-reservation-coordinator.test.ts`, usando o `setup()` existente (pedido com
`card-002` e `card-001`):

```ts
it('libera só os bilhetes informados', async () => {
  const { database, gateway, coordinator, pending } = setup()
  await coordinator.acquire(pending)

  await coordinator.releaseTickets(pending.id, ['sorteio-setembro:card-001'])

  expect(await gateway.inspect(key('card-001'))).toMatchObject({ reserved: false })
  expect(await gateway.inspect(key('card-002'))).toMatchObject({ reserved: true })
  database.close()
})

it('confirma a posse olhando só os bilhetes validados', async () => {
  const { database, orders, coordinator, pending } = setup()
  await coordinator.acquire(pending)
  orders.markItemsNotValidated(pending.id, ['sorteio-setembro:card-001'])
  await coordinator.releaseTickets(pending.id, ['sorteio-setembro:card-001'])

  expect(await coordinator.confirmOwnership(orders.get(pending.id)!)).toBe(true)
  database.close()
})
```

Em `server/shared/database.test.ts`, após "marca como validadas as reservas externas do pedido
pago":

```ts
it('lista para liberação a reserva de bilhete não validado e não a marca como validada', () => {
  const database = createDatabase(':memory:')
  const orders = new OrderRepository(database, reservationTime)
  const remote = new RemoteReservationRepository(database, reservationTime)
  const partial = order({ items: [ticket('card-004'), ticket('card-005')], totalInCents: 2000 })
  const refused = order({
    id: '00000000-0000-4000-8000-000000000002',
    items: [ticket('card-006')],
  })
  orders.createManual(partial)
  orders.createManual(refused)
  remote.recordHeld(partial.id, key('card-004'), 't4')
  remote.recordHeld(partial.id, key('card-005'), 't5')
  remote.recordHeld(refused.id, key('card-006'), 't6')

  orders.markItemsNotValidated(partial.id, ['sorteio-setembro:card-004'])
  orders.markItemsNotValidated(refused.id, ['sorteio-setembro:card-006'])
  orders.markNotValidated(refused.id)
  remote.markOrderValidated(partial.id)

  expect(remote.listAbandoned(10)).toEqual([
    { orderId: partial.id, key: key('card-004'), token: 't4' },
    { orderId: refused.id, key: key('card-006'), token: 't6' },
  ])
  database.close()
})
```

Se a ordem devolvida divergir (a consulta ordena por `updated_at`), comparar com
`expect.arrayContaining` e `toHaveLength(2)`.

Rodar: `npx vitest run server/domains/orders/ticket-reservation-coordinator.test.ts server/shared/database.test.ts` — FAIL.

- [ ] **Passo 2: implementação**

Em `remote-reservation-repository.ts`, um trecho SQL compartilhado no topo do arquivo:

```ts
// Reserva de bilhete marcado como não validado no próprio pedido.
const NOT_VALIDATED_TICKET = `EXISTS (
  SELECT 1 FROM json_each(o.items_json) AS item
  WHERE json_extract(item.value, '$.id') = r.ticket_number
    AND COALESCE(json_extract(item.value, '$.raffleId'), o.raffle_id) = r.raffle_id
    AND json_extract(item.value, '$.validationStatus') = 'not_validated'
)`
```

`listAbandoned`:

```sql
WHERE r.status = 'held'
  AND (o.status IN ('expired', 'cancelled', 'not_validated') OR ${NOT_VALIDATED_TICKET})
```

`markOrderValidated` passa a usar o alias e o filtro:

```sql
UPDATE remote_reservations AS r SET status = 'validated', updated_at = ?
WHERE r.order_id = ? AND r.status = 'held'
  AND NOT EXISTS (
    SELECT 1 FROM orders AS o WHERE o.id = r.order_id AND ${NOT_VALIDATED_TICKET}
  )
```

Em `ticket-reservation-coordinator.ts`:

```ts
import { ticketKey, validatedItems } from './sales-deadline.js'

  async confirmOwnership(order: Order) {
    const expected = new Set(validatedItems(order).map((item) => ticketKey(order, item)))
    const held = this.store.listHeld(order.id).filter((reservation) => expected.has(keyOf(reservation)))
    // Pedido criado antes da reserva externa: segue o fluxo anterior.
    if (held.length === 0 && !this.store.hasAny(order.id)) return true
    if (held.length !== expected.size) return false
    for (const reservation of held) {
      const snapshot = await this.gateway.inspect(reservation.key)
      if (!snapshot?.reserved || snapshot.validated || snapshot.token !== reservation.token) {
        return false
      }
    }
    return true
  }

  async releaseTickets(orderId: string, keys: string[]) {
    const wanted = new Set(keys)
    for (const reservation of this.store.listHeld(orderId)) {
      if (wanted.has(keyOf(reservation))) await this.release(reservation)
    }
  }
```

e no fim do arquivo:

```ts
function keyOf(reservation: HeldReservation) {
  return `${reservation.key.raffleId}:${reservation.key.ticketNumber}`
}
```

- [ ] **Passo 3: rodar e ver passar**

Rodar: `npx vitest run server/domains/orders server/shared`
Esperado: PASS.

- [ ] **Passo 4: commit**

```bash
git add server/domains/orders/remote-reservation-repository.ts server/domains/orders/ticket-reservation-coordinator.ts server/domains/orders/ticket-reservation-coordinator.test.ts server/shared/database.test.ts
git commit -m "feat(server): libera reserva externa de bilhete não validado"
```

---

### Tarefa 4: regra no `OrderService`

**Arquivos:**

- Modificar: `server/domains/orders/order-service.ts`
- Teste: `server/domains/orders/order-service.test.ts`

**Interfaces:**

- Consome: Tarefas 1–3.
- Produz: `OrderService` aplica a regra em `reconcile`, `approvePending`, `retryManualReview`; `withRaffleDetails` copia `salesEndAt`; pedido de concurso único limita `expiresAt`.

- [ ] **Passo 1: testes que falham**

Os testes chamam o serviço direto, com relógio controlado. Criar no arquivo de teste um gateway
com fim de vendas:

```ts
// Concurso com fim de vendas: o mock padrão não tem `salesEndAt`.
class DeadlineTicketGateway extends MockTicketGateway {
  constructor(private readonly salesEndAt: Record<string, string>) {
    super()
  }
  override async getActiveRaffles() {
    return (await super.getActiveRaffles()).map((raffle) => ({
      ...raffle,
      salesEndAt: this.salesEndAt[raffle.id],
    }))
  }
  override async getActiveRaffle() {
    const [first] = await this.getActiveRaffles()
    return first!
  }
}
```

O serviço direto precisa de um gateway de pagamento que confirme só NSU `mock-*` e devolva o
total gravado (o `MockPaymentGateway` exige `createCheckout` antes). Helper no arquivo de teste:

```ts
// Confirma só NSU `mock-*`, com o total gravado no pedido.
function confirmingPayments(repository: OrderRepository): PaymentGateway {
  return {
    createCheckout: async (order) => `https://checkout.example/${order.id}`,
    verifyPayment: async (reference) => ({
      paid: reference.transactionNsu.startsWith('mock-'),
      amountInCents: repository.get(reference.orderId)?.totalInCents ?? 0,
      captureMethod: 'pix',
    }),
  }
}

function createDeadlineService(salesEndAt: Record<string, string>) {
  let currentTime = new Date('2026-09-23T10:00:00.000Z')
  const now = () => currentTime
  const database = createDatabase(':memory:')
  const tickets = new DeadlineTicketGateway(salesEndAt)
  const fulfillOrder = vi.spyOn(tickets, 'fulfillOrder')
  const repository = new OrderRepository(database, now)
  const service = new OrderService(
    repository,
    tickets,
    confirmingPayments(repository),
    new CustomerService(new MockCustomerGateway()),
    new TicketReservationCoordinator(
      new MockTicketReservationGateway(30 * 60_000, now),
      new RemoteReservationRepository(database, now),
    ),
    env,
    now,
  )
  return {
    service,
    repository,
    fulfillOrder,
    setTime: (iso: string) => {
      currentTime = new Date(iso)
    },
    close: () => database.close(),
  }
}

function webhookFor(orderId: string, amount: number, nsu = `mock-${orderId}`) {
  return {
    invoice_slug: nsu,
    amount,
    paid_amount: amount,
    installments: 1,
    capture_method: 'pix',
    transaction_nsu: nsu,
    order_nsu: orderId,
    receipt_url: 'https://example.com/comprovante',
    items: [],
  }
}

const singleRaffle = (cardId: string) => ({
  raffleId: 'sorteio-setembro',
  selection: { mode: 'manual' as const, cardIds: [cardId] },
  customer: existingCustomer,
})

const bothRaffles = {
  raffles: [
    { raffleId: 'sorteio-setembro', selection: { mode: 'manual' as const, cardIds: ['card-001'] } },
    { raffleId: 'sorteio-domingo', selection: { mode: 'manual' as const, cardIds: ['card-002'] } },
  ],
  customer: existingCustomer,
}
```

Lembrete do comportamento de expiração: `expirePending` usa `expires_at < agora`, então no
instante exato do fim das vendas o pedido ainda está `pending`; depois dele, `expired`.

Casos, no `describe('fim das vendas')`:

```ts
describe('fim das vendas', () => {
  const capEnd = '2026-09-23T10:10:00.000Z'
  const espEnd = '2026-09-24T10:00:00.000Z'

  it('valida pagamento recebido antes do fim das vendas', async () => {
    const h = createDeadlineService({ 'sorteio-setembro': capEnd })
    const created = await h.service.createOrder(singleRaffle('card-020'))
    h.setTime('2026-09-23T10:09:59.000Z')
    h.repository.enqueuePaymentEvent(webhookFor(created.id, 1000))
    h.setTime('2026-09-23T10:09:59.500Z')
    await h.service.processNextPaymentEvent()

    expect(h.repository.get(created.id)?.status).toBe('paid')
    expect(h.fulfillOrder).toHaveBeenCalledTimes(1)
    h.close()
  })

  it('não valida pagamento recebido no instante do fim das vendas', async () => {
    const h = createDeadlineService({ 'sorteio-setembro': capEnd })
    const created = await h.service.createOrder(singleRaffle('card-020'))
    h.setTime(capEnd)
    h.repository.enqueuePaymentEvent(webhookFor(created.id, 1000))
    await h.service.processNextPaymentEvent()

    const order = h.repository.get(created.id)
    expect(order?.status).toBe('not_validated')
    expect(order?.items[0]?.validationStatus).toBe('not_validated')
    expect(h.repository.isReserved('sorteio-setembro:card-020')).toBe(false)
    expect(h.fulfillOrder).not.toHaveBeenCalled()
    h.close()
  })

  it('pagamento depois do fim das vendas vira não validado, não análise', async () => {
    const h = createDeadlineService({ 'sorteio-setembro': capEnd })
    const created = await h.service.createOrder(singleRaffle('card-020'))
    h.setTime('2026-09-25T08:00:00.000Z')
    h.repository.enqueuePaymentEvent(webhookFor(created.id, 1000))
    await h.service.processNextPaymentEvent()

    expect(h.repository.get(created.id)?.status).toBe('not_validated')
    expect(h.fulfillOrder).not.toHaveBeenCalled()
    h.close()
  })

  it('webhook com NSU não confirmado não antecipa o horário', async () => {
    const h = createDeadlineService({ 'sorteio-setembro': capEnd })
    const created = await h.service.createOrder(singleRaffle('card-020'))
    h.setTime('2026-09-23T10:05:00.000Z')
    h.repository.enqueuePaymentEvent(webhookFor(created.id, 1000, 'fake-1'))
    await h.service.processNextPaymentEvent()
    expect(h.repository.get(created.id)?.status).toBe('pending')

    h.setTime('2026-09-23T10:12:00.000Z')
    h.repository.enqueuePaymentEvent(webhookFor(created.id, 1000))
    await h.service.processNextPaymentEvent()

    expect(h.repository.get(created.id)?.status).toBe('not_validated')
    h.close()
  })

  it('redirect usa a chegada do webhook do mesmo NSU quando ela é anterior', async () => {
    const h = createDeadlineService({ 'sorteio-setembro': capEnd })
    const created = await h.service.createOrder(singleRaffle('card-020'))
    h.setTime('2026-09-23T10:03:00.000Z')
    h.repository.enqueuePaymentEvent(webhookFor(created.id, 1000))
    h.setTime('2026-09-23T10:05:00.000Z')

    await h.service.reconcileRedirect(created.id, `mock-${created.id}`, `mock-${created.id}`)

    expect(h.repository.get(created.id)).toMatchObject({
      status: 'paid',
      paymentReceivedAt: '2026-09-23T10:03:00.000Z',
    })
    h.close()
  })

  it('pedido agrupado pago depois do fim do CAP marca o CAP e manda o restante para análise', async () => {
    const h = createDeadlineService({ 'sorteio-setembro': capEnd, 'sorteio-domingo': espEnd })
    const created = await h.service.createOrder(bothRaffles)
    // O pedido agrupado expira no menor fim de vendas; o domingo perde a reserva local.
    h.setTime('2026-09-23T10:20:00.000Z')
    h.repository.enqueuePaymentEvent(webhookFor(created.id, 1600))
    await h.service.processNextPaymentEvent()

    const order = h.repository.get(created.id)
    expect(order?.status).toBe('manual_review')
    expect(order?.items.map((item) => item.validationStatus)).toEqual(['not_validated', undefined])
    h.close()
  })

  it('reprocessamento do pedido em análise valida só o bilhete no prazo', async () => {
    const h = createDeadlineService({ 'sorteio-setembro': capEnd, 'sorteio-domingo': espEnd })
    const created = await h.service.createOrder(bothRaffles)
    h.setTime('2026-09-23T10:20:00.000Z')
    h.repository.enqueuePaymentEvent(webhookFor(created.id, 1600))
    await h.service.processNextPaymentEvent()

    const retried = await h.service.retryManualReview(created.id)

    expect(retried.status).toBe('paid')
    expect(retried.items.map((item) => item.validationStatus)).toEqual(['not_validated', undefined])
    expect(h.fulfillOrder.mock.calls[0]?.[0].items.map((item) => item.id)).toEqual(['card-002'])
    h.close()
  })

  it('reprocessamento de pedido antigo sem hora gravada usa o primeiro webhook', async () => {
    const h = createDeadlineService({ 'sorteio-setembro': capEnd, 'sorteio-domingo': capEnd })
    const created = await h.service.createOrder(bothRaffles)
    h.setTime('2026-09-23T10:20:00.000Z')
    h.repository.enqueuePaymentEvent(webhookFor(created.id, 1600))
    // Simula pedido em análise gravado antes da v10: sem payment_received_at.
    h.repository.markManualReview(created.id, 'Pagamento confirmado sem reserva ativa.')

    const retried = await h.service.retryManualReview(created.id)

    expect(retried.status).toBe('not_validated')
    expect(h.fulfillOrder).not.toHaveBeenCalled()
    h.close()
  })

  it('baixa manual no instante do fim do CAP valida só o domingo', async () => {
    const h = createDeadlineService({ 'sorteio-setembro': capEnd, 'sorteio-domingo': espEnd })
    const created = await h.service.createOrder(bothRaffles)
    h.setTime(capEnd)

    const approved = await h.service.approvePending(created.id)

    expect(approved.status).toBe('paid')
    expect(approved.paymentReceivedAt).toBe(capEnd)
    expect(approved.items.map((item) => item.validationStatus)).toEqual([
      'not_validated',
      undefined,
    ])
    expect(h.fulfillOrder.mock.calls[0]?.[0].items.map((item) => item.id)).toEqual(['card-002'])
    h.close()
  })

  it('baixa manual depois do fim das vendas é recusada porque o pedido expirou', async () => {
    const h = createDeadlineService({ 'sorteio-setembro': capEnd })
    const created = await h.service.createOrder(singleRaffle('card-020'))
    h.setTime('2026-09-23T10:11:00.000Z')

    await expect(h.service.approvePending(created.id)).rejects.toMatchObject({ statusCode: 409 })
    h.close()
  })

  it('pedido de concurso único expira no fim das vendas', async () => {
    const h = createDeadlineService({ 'sorteio-setembro': '2026-09-23T10:05:00.000Z' })
    const created = await h.service.createOrder(singleRaffle('card-020'))
    expect(created.expiresAt).toBe('2026-09-23T10:05:00.000Z')
    h.close()
  })
})
```

Rodar: `npx vitest run server/domains/orders/order-service.test.ts -t "fim das vendas"` — FAIL.

- [ ] **Passo 2: implementação**

Em `order-service.ts`, importar:

```ts
import { lateTicketKeys, validatedItems } from './sales-deadline.js'
```

`withRaffleDetails` copia o fim das vendas:

```ts
    drawDate: raffle.drawDate,
    ...(raffle.salesEndAt ? { salesEndAt: raffle.salesEndAt } : {}),
```

Em `createOrder` (concurso único), trocar o cálculo de `expiresAt` pelo mesmo limite do agrupado:

```ts
const expiresAtMs = Math.min(
  now.getTime() + this.env.ORDER_EXPIRATION_MINUTES * 60_000,
  ...(raffle.salesEndAt ? [Date.parse(raffle.salesEndAt)] : []),
)
if (expiresAtMs <= now.getTime()) {
  throw new DomainError('O sorteio informado nao esta ativo.', 409)
}
```

e usar `expiresAt: new Date(expiresAtMs).toISOString()` no `draft`.

Método privado novo:

```ts
  // Bilhete pago a partir do fim das vendas não é validado: o código Pix vale 72 h e o cliente
  // poderia pagar depois de ver o sorteio. A hora é sempre do servidor.
  private async applySalesDeadline(orderId: string, receivedAt: string) {
    const order = this.requireOrder(orderId)
    const late = lateTicketKeys(order, receivedAt)
    if (late.length === 0) return 'continue' as const
    this.repository.markItemsNotValidated(orderId, late)
    await this.reservations.releaseTickets(orderId, late)
    if (late.length < order.items.length) return 'continue' as const
    this.repository.markNotValidated(orderId)
    return 'none_valid' as const
  }
```

`reconcile`:

```ts
  private async reconcile(event: PaymentEvent) {
    const order = this.requireOrder(event.order_nsu)
    if (['paid', 'processing', 'manual_review', 'not_validated'].includes(order.status)) return
    const verification = await this.payments.verifyPayment({
      orderId: order.id,
      transactionNsu: event.transaction_nsu,
      invoiceSlug: event.invoice_slug,
    })
    if (!verification.paid) return
    const verifiedEvent = { ...event, capture_method: verification.captureMethod }
    this.repository.recordPaymentEvidence(verifiedEvent)
    // Webhook do mesmo NSU guardado antes vale mais que a hora do redirect.
    const receivedAt = this.repository.recordPaymentReceivedAt(
      order.id,
      this.repository.findPaymentEventReceivedAt(event.transaction_nsu, event.invoice_slug) ??
        this.now().toISOString(),
    )
    if (verification.amountInCents !== order.totalInCents) {
      this.repository.markManualReview(order.id, 'Pagamento confirmado com valor divergente.')
      return
    }
    if ((await this.applySalesDeadline(order.id, receivedAt)) === 'none_valid') return

    const pending = validatedItems(this.requireOrder(order.id)).length
    if (!this.repository.tryStartProcessing(order.id, pending)) {
      const current = this.requireOrder(order.id)
      if (current.status === 'expired' || current.status === 'cancelled') {
        this.repository.markManualReview(
          order.id,
          'Pagamento confirmado sem reserva ativa; exige analise manual.',
        )
      }
      return
    }

    await this.fulfill(order.id)
  }
```

`approvePending`:

```ts
  async approvePending(orderId: string) {
    const order = this.requireOrder(orderId)
    if (order.status !== 'pending') {
      throw new DomainError('Somente pedidos pendentes podem receber baixa manual.', 409)
    }
    const receivedAt = this.now().toISOString()
    if ((await this.applySalesDeadline(order.id, receivedAt)) === 'none_valid') {
      this.repository.recordPaymentReceivedAt(order.id, receivedAt)
      this.repository.recordManualPayment(order.id)
      return this.requireOrder(order.id)
    }
    const pending = validatedItems(this.requireOrder(order.id)).length
    if (!this.repository.tryStartProcessing(order.id, pending)) {
      throw new DomainError(
        'A reserva deste pedido expirou ou foi cancelada; ele não pode mais ser aprovado.',
        409,
        'ORDER_RESERVATION_LOST',
      )
    }
    this.repository.recordPaymentReceivedAt(order.id, receivedAt)
    this.repository.recordManualPayment(order.id)
    await this.fulfill(order.id)
    return this.requireOrder(order.id)
  }
```

Observação: o `expiresAt` agora é limitado ao fim das vendas, então pedido pendente depois do
prazo já está `expired` e a baixa responde `409` antes da regra. A regra em `approvePending`
age no instante exato do fim (o pedido ainda é `pending`, porque a expiração usa `<`) e em
pedido agrupado em que só um concurso encerrou.

`retryManualReview`:

```ts
  async retryManualReview(orderId: string) {
    const order = this.requireOrder(orderId)
    if (order.status !== 'manual_review') {
      throw new DomainError('Somente pedidos em análise podem ser reprocessados.', 409)
    }
    // Pedido anterior à migração v10 usa a chegada do primeiro webhook; baixa manual antiga não
    // tem evento e não é checada.
    const receivedAt = order.paymentReceivedAt ?? this.repository.firstPaymentEventAt(order.id)
    if (receivedAt && (await this.applySalesDeadline(order.id, receivedAt)) === 'none_valid') {
      return this.requireOrder(order.id)
    }
    const current = this.requireOrder(order.id)
    for (const item of validatedItems(current)) {
      const available = await this.tickets.getAvailableTicket(
        item.raffleId ?? current.raffleId,
        item.id,
      )
      if (!available) {
        throw new DomainError(
          `O bilhete ${item.code} não está mais disponível. Cancele o pedido e estorne o pagamento.`,
          409,
          'TICKET_UNAVAILABLE',
        )
      }
    }
    if (!this.repository.claimManualReviewRetry(order.id)) {
      throw new DomainError('O pedido mudou de status. Atualize a lista e tente novamente.', 409)
    }
    if (!current.captureMethod) this.repository.recordManualPayment(order.id)
    await this.fulfill(order.id)
    return this.requireOrder(order.id)
  }
```

`fulfill` envia só os validados:

```ts
const updatedOrder = this.requireOrder(orderId)
const customer = await this.customers.ensureRegistered(updatedOrder.customer)
await this.tickets.fulfillOrder({
  ...updatedOrder,
  items: validatedItems(updatedOrder),
  customer,
  status: 'processing',
})
```

- [ ] **Passo 3: rodar e ver passar**

Rodar: `npx vitest run server/domains/orders`
Esperado: PASS, inclusive os testes antigos.

- [ ] **Passo 4: commit**

```bash
git add server/domains/orders/order-service.ts server/domains/orders/order-service.test.ts
git commit -m "feat(server): não valida bilhete pago após o fim das vendas"
```

---

### Tarefa 5: presenters, e-mail e painel no backend

**Arquivos:**

- Modificar: `server/http/order-presenter.ts`, `server/http/admin-presenter.ts`
- Modificar: `server/domains/ticket-emails/ticket-card.ts`
- Modificar: `server/domains/admin/admin-dashboard-repository.ts`, `admin-dashboard-service.ts`, `admin-sales-service.ts`
- Teste: arquivos `*.test.ts` vizinhos (`server/http/*.test.ts` que cobrem presenter, `ticket-card.test.ts`, teste do dashboard se houver; senão criar `server/domains/admin/admin-dashboard-repository.test.ts`)

**Interfaces:**

- Consome: `validatedItems`, `refundDueInCents`, `isNotValidated` (Tarefa 1).
- Produz (contrato público):
  - Item de `presentOrder`: `salesEndAt?: string`, `validationStatus?: 'not_validated'`.
  - `presentOrder`: `refundDueInCents?: number` (só quando > 0); `message` para `not_validated` e para pedido parcial.
  - `presentPurchase`: dados do comprovante só para itens validados de pedido `paid`.
  - `presentAdminOrder`: item com `validationStatus`; pedido com `refundDueInCents`.
  - Dashboard `totals.refundDueInCents`; `paidTickets`, `revenueInCents`, `dailySales`, `ticketsByRaffle` sem bilhetes não validados.

- [ ] **Passo 1: testes que falham**

- `ticket-card.test.ts`: pedido com dois itens, um `not_validated` → `buildTicketCards(...).cards` tem um cartão.
- Presenter (no teste HTTP que já cobre `/api/v1/orders/mine`, ou novo `server/http/order-presenter.test.ts`):

```ts
it('expõe prazo, bilhete não validado e valor a estornar', () => {
  const presented = presentPurchase(
    order({
      status: 'paid',
      paidAt: '2026-09-23T10:05:00.000Z',
      totalInCents: 2000,
      items: [
        {
          ...ticket('card-001'),
          salesEndAt: '2026-09-23T10:00:00.000Z',
          validationStatus: 'not_validated',
          identification: 'X-1',
        },
        { ...ticket('card-002'), salesEndAt: '2026-09-24T10:00:00.000Z', identification: 'X-2' },
      ],
    }),
  )
  expect(presented.refundDueInCents).toBe(1000)
  expect(presented.items[0]).toMatchObject({
    validationStatus: 'not_validated',
    salesEndAt: '2026-09-23T10:00:00.000Z',
  })
  expect(presented.items[0]).not.toHaveProperty('identification')
  expect(presented.items[1]).toMatchObject({ identification: 'X-2' })
  expect(presented.message).toMatch(/não validado/)
})

it('pedido não validado não traz dados pessoais', () => {
  const presented = presentPurchase(
    order({
      status: 'not_validated',
      items: [{ ...ticket('card-001'), validationStatus: 'not_validated' }],
    }),
  )
  expect(presented).not.toHaveProperty('customer')
})
```

- Dashboard: banco `:memory:`, inserir pedido `paid` com dois itens de 1000 (um `not_validated`) e pedido `not_validated` com um item de 600; esperar `revenue_in_cents = 1000`, `paid_tickets = 1`, `refund_due_in_cents = 1600`, e `paidByRaffle` somando só o validado.

Rodar os arquivos — FAIL.

- [ ] **Passo 2: presenter público**

Em `order-presenter.ts`:

```ts
import { isNotValidated, refundDueInCents } from '../domains/orders/sales-deadline.js'

export function presentOrder(order: Order) {
  const refundDue = refundDueInCents(order)
  return {
    id: order.id,
    status: order.status,
    selectionMode: order.selectionMode,
    unitPriceInCents: order.unitPriceInCents,
    totalInCents: order.totalInCents,
    items: order.items.map((item) => ({
      id: item.id,
      code: item.code,
      numbers: item.numbers,
      secondChanceNumbers: item.secondChanceNumbers ?? [],
      raffleId: item.raffleId ?? order.raffleId,
      raffleTitle: item.raffleTitle ?? order.raffleTitle,
      unitPriceInCents: item.unitPriceInCents ?? order.unitPriceInCents,
      ...(item.salesEndAt ? { salesEndAt: item.salesEndAt } : {}),
      ...(isNotValidated(item) ? { validationStatus: 'not_validated' as const } : {}),
    })),
    ...(refundDue > 0 ? { refundDueInCents: refundDue } : {}),
    receiptUrl: order.receiptUrl,
    expiresAt: order.expiresAt,
    message: messageFor(order, refundDue),
  }
}

function messageFor(order: Order, refundDue: number) {
  if (order.status === 'manual_review') {
    return 'Pagamento recebido. Estamos confirmando seus bilhetes manualmente.'
  }
  if (order.status === 'not_validated') {
    return 'Pagamento recebido após o fim das vendas do concurso. Os bilhetes não foram validados e o valor será estornado.'
  }
  if (order.status === 'paid' && refundDue > 0) {
    return 'Parte do pagamento chegou após o fim das vendas de um concurso. Os bilhetes marcados como não validados não concorrem e o valor deles será estornado.'
  }
  return undefined
}
```

Em `presentPurchase`, no `items.map` do pedido pago, devolver só `item` para bilhete não validado:

```ts
    items: summary.items.map((item, index) => {
      const ticket = order.items[index]
      if (!ticket || isNotValidated(ticket)) return item
      return {
        ...item,
        identification: ticket.identification,
        drawDate: ticket.drawDate,
        prizes: ticket.prizes,
        luckySpins: ticket.luckySpins,
        validationBatch: ticket.validationBatch,
        batchPosition: ticket.batchPosition,
      }
    }),
```

- [ ] **Passo 3: presenter do painel e e-mail**

`admin-presenter.ts`: importar `isNotValidated`, `refundDueInCents`; no item acrescentar `...(isNotValidated(item) ? { validationStatus: 'not_validated' as const } : {})`; no pedido, `refundDueInCents: refundDueInCents(order)` quando > 0 (mesmo padrão do presenter público).

`ticket-card.ts`: `cards: validatedItems(order).map((item) => {`. Importar de `../orders/sales-deadline.js`.

- [ ] **Passo 4: dashboard**

Em `admin-dashboard-repository.ts`, no topo:

```ts
const VALID_ITEMS = `(SELECT COUNT(*) FROM json_each(orders.items_json) AS item
  WHERE json_extract(item.value, '$.validationStatus') IS NULL)`
const REFUND_DUE = `(SELECT COALESCE(SUM(COALESCE(json_extract(item.value, '$.unitPriceInCents'),
    orders.unit_price_in_cents)), 0)
  FROM json_each(orders.items_json) AS item
  WHERE json_extract(item.value, '$.validationStatus') = 'not_validated')`
```

`totals`: `paid_tickets` usa `${VALID_ITEMS}` em vez de `json_array_length(items_json)`; `revenue_in_cents` usa `total_in_cents - ${REFUND_DUE}`; acrescentar
`COALESCE(SUM(CASE WHEN status IN ('paid', 'not_validated') THEN ${REFUND_DUE} END), 0) AS refund_due_in_cents` e o campo no `totalsSchema`.
`dailyPaid`: `SUM(total_in_cents - ${REFUND_DUE})` e `SUM(${VALID_ITEMS})`.
`paidByRaffle`: no `WHERE`, `AND json_extract(item.value, '$.validationStatus') IS NULL`.

Em `admin-dashboard-service.ts`, expor `refundDueInCents: totals.refund_due_in_cents` em `totals`.

Em `admin-sales-service.ts`, no CSV de pedidos, se houver coluna de quantidade/total, acrescentar coluna `A estornar` com `formatCentsForCsv(refundDueInCents(order))` (acrescentar o cabeçalho na mesma posição).

- [ ] **Passo 5: rodar e ver passar**

Rodar: `npx vitest run server`
Esperado: PASS.

- [ ] **Passo 6: commit**

```bash
git add server/http server/domains/ticket-emails server/domains/admin
git commit -m "feat(server): expõe bilhete não validado e valor a estornar"
```

---

### Tarefa 6: tipos do frontend e aviso compartilhado

**Arquivos:**

- Criar: `src/shared/lib/sales-deadline.ts`, `src/shared/lib/sales-deadline.test.ts`, `src/shared/ui/SalesDeadlineNotice.tsx`
- Modificar: `src/features/raffle/{api/schemas.ts,domain/types.ts,repository/raffle-repository.ts}`
- Modificar: `src/features/cart/{domain/types.ts,runtime/CartProvider.tsx}`
- Modificar: `src/features/checkout/{api/schemas.ts,domain/types.ts}`
- Modificar: `src/features/purchases/service/purchase-labels.ts`

**Interfaces produzidas:**

- `salesDeadlineMessage(salesEndAt?: string): string`
- `<SalesDeadlineNotice salesEndAt?: string title?: string />`
- `Raffle.salesEndAt?: string`; `CartEntry.salesEndAt?: string`
- `PaymentStatus` com `'not_validated'`; item de `Order` com `salesEndAt?`, `validationStatus?`; `Order.refundDueInCents?`

- [ ] **Passo 1: teste do texto**

```ts
// src/shared/lib/sales-deadline.test.ts
import { describe, expect, it } from 'vitest'
import { salesDeadlineMessage } from './sales-deadline'

describe('salesDeadlineMessage', () => {
  it('mostra a data do servidor no fuso de Fortaleza', () => {
    expect(salesDeadlineMessage('2026-09-27T22:00:00.000Z')).toBe(
      'Pague até 27/09/2026, 19:00 (horário de Fortaleza). O código Pix vale por 72 horas, mas pagamento recebido depois do fim das vendas do concurso não valida o bilhete: ele fica como não validado e o valor é estornado.',
    )
  })

  it('usa texto sem data quando o concurso não informa o fim das vendas', () => {
    expect(salesDeadlineMessage(undefined)).toMatch(/^Pague antes do fim das vendas do concurso\./)
  })
})
```

Rodar `npx vitest run src/shared/lib/sales-deadline.test.ts` — FAIL.

- [ ] **Passo 2: texto e componente**

```ts
// src/shared/lib/sales-deadline.ts
import { formatDateTime } from './date'

const rule =
  'O código Pix vale por 72 horas, mas pagamento recebido depois do fim das vendas do concurso não valida o bilhete: ele fica como não validado e o valor é estornado.'

// Só formata a data vinda do servidor; o prazo nunca é decidido pelo relógio do dispositivo.
export function salesDeadlineMessage(salesEndAt?: string) {
  const first = salesEndAt
    ? `Pague até ${formatDateTime(salesEndAt)} (horário de Fortaleza).`
    : 'Pague antes do fim das vendas do concurso.'
  return `${first} ${rule}`
}
```

Conferir a saída real de `formatDateTime` (`Intl` pt-BR com `hour`/`minute`) e ajustar a expectativa do teste se o separador for diferente de `, `.

```tsx
// src/shared/ui/SalesDeadlineNotice.tsx
import { AlarmClock } from 'lucide-react'
import { salesDeadlineMessage } from '../lib/sales-deadline'

export function SalesDeadlineNotice({
  salesEndAt,
  title,
}: {
  salesEndAt?: string
  title?: string
}) {
  return (
    <p className="sales-deadline-notice" role="note">
      <AlarmClock size={16} aria-hidden="true" />
      <span>
        {title ? <strong>{title}: </strong> : null}
        {salesDeadlineMessage(salesEndAt)}
      </span>
    </p>
  )
}
```

Acrescentar estilo `.sales-deadline-notice` no CSS global (procurar `.privacy-note` e `.availability-note` e seguir o mesmo padrão, com tom de aviso).

- [ ] **Passo 3: tipos e schemas**

- `raffle/api/schemas.ts`: em `raffleSchema`, `salesEndAt: z.iso.datetime().optional(),`. `domain/types.ts`: `salesEndAt?: string`. Mock do repository: `salesEndAt: '2026-09-30T20:00:00.000Z'` e `'2026-10-04T22:00:00.000Z'`.
- `cart/domain/types.ts`: `salesEndAt?: string` em `CartEntry`. `CartProvider.tsx`: `salesEndAt: z.string().optional()` em `cartEntrySchema` e `...(raffle.salesEndAt ? { salesEndAt: raffle.salesEndAt } : {})` em `setSelections`.
- `checkout/api/schemas.ts`: status com `'not_validated'`; item com `salesEndAt: z.iso.datetime().optional()` e `validationStatus: z.literal('not_validated').optional()`; pedido com `refundDueInCents: z.number().int().positive().optional()`. Espelhar em `checkout/domain/types.ts`.
- `purchase-labels.ts`: `not_validated: { label: 'Não validado', tone: 'warning' }` e comentário: "`not_validated` é dinheiro recebido depois do fim das vendas: nunca exibir como sucesso."

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run src/shared src/features` e `npx tsc --noEmit -p tsconfig.app.json` (ou o `typecheck` do projeto).
Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add src/shared src/features/raffle src/features/cart src/features/checkout src/features/purchases
git commit -m "feat(web): tipos de prazo de vendas e aviso compartilhado"
```

---

### Tarefa 7: telas do cliente

**Arquivos:**

- Modificar: `src/pages/HomePage.tsx`, `src/pages/CartPage.tsx`, `src/pages/PaymentPage.tsx`, `src/pages/PurchasesPage.tsx`
- Teste: `src/pages/HomePage.test.tsx`, `src/pages/CartPage.test.tsx`, `src/pages/PurchasesPage.test.tsx`

**Interfaces:**

- Consome: `SalesDeadlineNotice`, tipos da Tarefa 6.

- [ ] **Passo 1: testes que falham**

- `HomePage.test.tsx`: no mock de concursos, `salesEndAt: '2026-09-30T20:00:00.000Z'`; esperar `screen.getByText(/Pague até 30\/09\/2026, 17:00/)`.
- `CartPage.test.tsx`: no carrinho semeado, `salesEndAt` na primeira entrada; com conta completa, esperar o aviso com o título do concurso (`getByText(/Sorteio de Setembro/)` dentro de `getAllByRole('note')`) e, para a entrada sem `salesEndAt`, o texto "Pague antes do fim das vendas do concurso".
- `PurchasesPage.test.tsx`:
  - pedido `not_validated` com `refundDueInCents: 1000`: selo "Não validado", mensagem do backend, sem botão "Compartilhar".
  - pedido `paid` parcial: o bilhete `not_validated` mostra "Não validado" e não tem botão de compartilhar; o validado tem.
  - pedido `pending` com item `salesEndAt`: aviso "Pague até ...".

Rodar `npx vitest run src/pages` — FAIL.

- [ ] **Passo 2: `HomePage`**

Em cada `article.raffle-selection`, logo após o `<div className="raffle-selection__meta">`:

```tsx
<SalesDeadlineNotice salesEndAt={raffle.salesEndAt} />
```

- [ ] **Passo 3: `CartPage`**

No `<aside className="order-summary surface">`, antes do botão "Continuar para o Pix":

```tsx
{
  cart.entries.map((entry) => (
    <SalesDeadlineNotice
      key={entry.raffleId}
      title={cart.entries.length > 1 ? entry.raffleTitle : undefined}
      salesEndAt={entry.salesEndAt}
    />
  ))
}
```

- [ ] **Passo 4: `PaymentPage`**

Antes do bloco `expired`/`cancelled`, novo estado:

```tsx
if (order?.status === 'not_validated') {
  return (
    <section className="container payment-state page-section">
      <div className="payment-icon payment-icon--danger">
        <XCircle size={42} />
      </div>
      <span className="eyebrow">
        <span /> Pagamento fora do prazo
      </span>
      <h1>Seus bilhetes não foram validados</h1>
      <p>{order.message}</p>
      {order.refundDueInCents ? (
        <p>
          Valor a estornar: <strong>{formatCurrency(order.refundDueInCents)}</strong>
        </p>
      ) : null}
      <Link className="button button--secondary" to="/minhas-compras">
        <ReceiptText size={18} /> Ver minhas compras
      </Link>
    </section>
  )
}
```

No estado `paid`, quando `order.message` existir (pedido parcial), renderizar `<p className="purchase-card__message">{order.message}</p>` abaixo do parágrafo do pedido e listar os bilhetes não validados:

```tsx
{
  order.items?.some((item) => item.validationStatus === 'not_validated') ? (
    <ul className="payment-state__not-validated">
      {order.items
        .filter((item) => item.validationStatus === 'not_validated')
        .map((item) => (
          <li key={`${item.raffleId}-${item.id}`}>
            Bilhete {item.code} ({item.raffleTitle}): não validado
          </li>
        ))}
    </ul>
  ) : null
}
```

No estado de espera (`pending`), abaixo do parágrafo, o aviso com o menor `salesEndAt` dos itens:

```tsx
{
  order?.status === 'pending' ? (
    <SalesDeadlineNotice salesEndAt={earliestSalesEnd(order.items)} />
  ) : null
}
```

com, no mesmo arquivo:

```tsx
// Menor fim de vendas entre os concursos do pedido; ISO em UTC ordena como texto.
function earliestSalesEnd(items: Order['items']) {
  return items
    ?.map((item) => item.salesEndAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0]
}
```

Incluir `not_validated` no `refetchInterval`: retorna `false` (estado final). Importar `formatCurrency`, `SalesDeadlineNotice` e o tipo `Order` de `../features/checkout/domain/types`.

- [ ] **Passo 5: `PurchasesPage`**

Em `PurchaseCard`:

```tsx
const canShare =
  purchase.status === 'paid' && items.some((item) => item.validationStatus !== 'not_validated')
const shareableItems = items.filter((item) => item.validationStatus !== 'not_validated')
```

- No `dl`, quando `purchase.refundDueInCents`, um item `<div><dt>A estornar</dt><dd>{formatCurrency(purchase.refundDueInCents)}</dd></div>`.
- Para `pending`, abaixo da mensagem: `<SalesDeadlineNotice salesEndAt={earliestSalesEnd(items)} />` (mesma função do Passo 4; mover para `src/features/checkout/service/sales-deadline.ts` e importar nas duas páginas, para não duplicar).
- Em cada `li`, após o título do bilhete:

```tsx
{
  item.validationStatus === 'not_validated' ? (
    <span className="status-badge status-badge--warning">Não validado</span>
  ) : null
}
```

e o botão "Compartilhar" do item só quando `canShare && item.validationStatus !== 'not_validated'`.

- O botão "Compartilhar no WhatsApp" do pedido usa `items={shareableItems}`.

- [ ] **Passo 6: rodar e ver passar**

Rodar: `npx vitest run src/pages`
Esperado: PASS.

- [ ] **Passo 7: commit**

```bash
git add src/pages src/features/checkout/service src/styles
git commit -m "feat(web): aviso de prazo e bilhete não validado nas telas do cliente"
```

(Ajustar o caminho do CSS ao arquivo real.)

---

### Tarefa 8: painel administrativo

**Arquivos:**

- Modificar: `src/features/admin/{api/schemas.ts,domain/types.ts,service/order-labels.ts,service/list-params.ts}`
- Modificar: `src/pages/admin/AdminSalesPage.tsx`, `src/pages/admin/AdminHomePage.tsx`
- Teste: testes existentes de `src/features/admin` e `src/pages/admin` (procurar `*.test.tsx`); e2e `tests/e2e/admin-sales.spec.ts` só se quebrar.

- [ ] **Passo 1: tipos e rótulos**

- Status `'not_validated'` em `orderStatusSchema` (admin), `OrderStatus`, `list-params.ts`.
- `order-labels.ts`: `not_validated: 'Não validado'` e tom `'warning'`. `canApprove`/`canCancel` não mudam (não incluem `not_validated`).
- `adminOrderSchema`: item com `validationStatus: z.literal('not_validated').optional()`; pedido com `refundDueInCents: z.number().int().positive().optional()`. Totais do dashboard com `refundDueInCents: z.number().int()`. Espelhar em `domain/types.ts`.

- [ ] **Passo 2: telas**

`AdminSalesPage.tsx`, coluna `items`: código do bilhete não validado com sufixo ` (não validado)`:

```tsx
.map((item) => (item.validationStatus === 'not_validated' ? `${item.code} (não validado)` : item.code))
```

Coluna `status`: abaixo do selo,

```tsx
{
  order.refundDueInCents ? (
    <span className="admin-cell-error">A estornar: {formatCurrency(order.refundDueInCents)}</span>
  ) : null
}
```

`AdminHomePage.tsx`: ao lado do alerta de `manualReviewOrders`, alerta quando `totals.refundDueInCents > 0`: "{valor} recebidos após o fim das vendas aguardam estorno." Filtro de status da lista de vendas: incluir a opção "Não validado" (seguir como as opções existentes são montadas a partir de `orderStatusLabels`).

- [ ] **Passo 3: rodar**

Rodar: `npx vitest run src/features/admin src/pages/admin`
Esperado: PASS (ajustar fixtures de teste que montam `totals` sem `refundDueInCents`).

- [ ] **Passo 4: commit**

```bash
git add src/features/admin src/pages/admin
git commit -m "feat(admin): status não validado e valor a estornar"
```

---

### Tarefa 9: documentação, E2E e verificação final

**Arquivos:**

- Modificar: `docs/API_CONTRACTS.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `AGENTS.md` (se listar estados), este plano.
- Teste: `tests/e2e/purchase.spec.ts`

- [ ] **Passo 1: E2E**

Em `tests/e2e/purchase.spec.ts`, na jornada que chega ao carrinho, acrescentar:

```ts
await expect(page.getByRole('note').first()).toContainText('O código Pix vale por 72 horas')
```

(Concursos mock não têm fim de vendas: o texto é o genérico. O pagamento atrasado é coberto pela Tarefa 4.)

- [ ] **Passo 2: documentação**

- `docs/API_CONTRACTS.md`: status públicos com `not_validated`; parágrafo da regra (hora do servidor, `payment_events.created_at` do NSU confirmado, redirect, baixa manual, `>=`); campos `salesEndAt`, `validationStatus`, `refundDueInCents`; `/orders/mine` sem dados de comprovante para item não validado; dashboard `refundDueInCents` e receita sem bilhetes não validados; "Limitações conhecidas": estorno manual.
- `ARCHITECTURE.md` e `CLAUDE.md`: estados do pedido passam a incluir `not_validated` ("dinheiro recebido após o fim das vendas; nunca sucesso; estorno fora do sistema").
- Neste plano: preencher "Progresso" e "Validação".

- [ ] **Passo 3: verificação**

Rodar: `npm run check` — esperado: lint, prettier, arquitetura, docs, testes e build verdes.
Rodar: `npm run test:e2e` — esperado: verde em chromium e mobile.

- [ ] **Passo 4: commit**

```bash
git add docs ARCHITECTURE.md CLAUDE.md AGENTS.md tests/e2e
git commit -m "docs: status não validado e regra do fim das vendas"
```

## Decisões

Ver tabela da spec. Acrescentado no plano:

- Sem reserva por `drawDate` para bilhete sem `salesEndAt` (concursos mock têm datas fixas no passado).
- `payment_received_at` guarda o menor horário recebido; gravado só em caminho de sucesso da baixa manual, para uma baixa recusada não "carimbar" horário.
- `markNotValidated` grava `paid_at` (dinheiro recebido) para "Minhas compras" mostrar quando e como foi pago.

## Progresso

- 2026-10-30: spec aprovada e plano escrito.

## Validação

Pendente.
