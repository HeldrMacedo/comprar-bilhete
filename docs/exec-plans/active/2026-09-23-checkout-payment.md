# Checkout and Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver customer lookup, address collection for new customers, backend-owned manual and random ticket reservation, InfinitePay checkout, and verified payment completion.

**Architecture:** React continues to call only the Fastify API through typed repositories. Fastify resolves customers and tickets through external gateways, persists orders and reservations transactionally in SQLite, creates InfinitePay checkout links, and promotes orders only after server-side payment reconciliation. The existing `domain -> api -> repository -> service -> runtime -> ui/pages` dependency direction remains intact.

**Tech Stack:** TypeScript 5.9 strict mode, React 19, TanStack Query, React Hook Form, Zod 4, Fastify 5, Node SQLite, Vitest, Testing Library, Playwright.

**Spec:** `docs/design-docs/2026-09-23-checkout-payment-design.md`

## Global Constraints

- Read `docs/PRODUCT.md`, `ARCHITECTURE.md`, `docs/FRONTEND.md`, `docs/BACKEND.md`, `docs/API_CONTRACTS.md`, `docs/SECURITY.md`, and the linked spec before implementation.
- Use only current contest data and `estabelecimento_id=4734`; regional `57` is a local invariant and is not sent to the external endpoint.
- Keep all money as positive integer cents. Never accept the browser's price as authoritative.
- Validate all network and persisted JSON with Zod. Do not use `any` or unchecked type assertions for external data.
- The frontend calls only `/api`; it never calls InfinitePay or the ticket API directly.
- Redirect and webhook data never confirm payment. Only backend `payment_check` can advance a paid order.
- Never persist CPF, phone, or address in browser storage or write them to application logs.
- Preserve keyboard access, visible focus, loading/error/empty states, and the 360 px layout.
- Do not add runtime dependencies.
- Preserve user-owned changes in `package-lock.json` and `prompt.md` unless a later explicit requirement needs them.

## Review Focus

- A late CPF lookup response must not overwrite a newer phone/CPF value; Task 7 adds a stale-response UI test using TanStack Query cancellation.
- An existing external person with missing CPF or phone must leave the missing required field editable; Task 7 pins this behavior in the form test.
- Random quantities `0`, `51`, non-integers, and quantities larger than live inventory must be rejected without a partial reservation; Tasks 5 and 8 add schema and integration tests.
- Duplicate webhooks arriving while the first event is processing must create one durable event and invoke fulfillment once; Task 6 adds a concurrent injection test.
- A payment confirmed after reservation expiry must preserve transaction evidence and enter `manual_review`, never `paid`; Task 6 adds the state-transition test.

## File Map

New backend customer files:

- `server/domains/customers/customer-types.ts`: customer/address schemas and normalized types.
- `server/domains/customers/customer-gateway.ts`: external customer port.
- `server/domains/customers/customer-service.ts`: lookup, CPF/phone conflict resolution, and registration orchestration.
- `server/domains/customers/live-customer-gateway.ts`: Zod-validated ticket-API adapter.
- `server/domains/customers/mock-customer-gateway.ts`: deterministic local/E2E provider.
- `server/domains/customers/customer-service.test.ts`: customer-domain behavior.
- `server/domains/customers/live-customer-gateway.test.ts`: HTTP adapter contract.

New persistence files:

- `server/shared/database-migrations.ts`: ordered, transactional SQLite migrations.
- `server/shared/database.test.ts`: migration and compatibility tests.
- `server/domains/orders/order-test-fixtures.ts`: schema-valid order and customer builders shared by backend tests.

New frontend checkout files:

- `src/features/checkout/repository/customer-repository.ts`: own-backend customer lookup.
- `src/features/checkout/runtime/use-customer-lookup.ts`: debounced, cancellable TanStack Query integration.
- `src/features/checkout/runtime/use-customer-lookup.test.tsx`: stale response and state tests.
- `src/test/render-with-query.tsx`: isolated QueryClient test wrapper.
- `src/pages/CartPage.test.tsx`: checkout form and conflict UX.
- `src/features/cart/runtime/CartProvider.test.tsx`: persisted manual/random cart contract.

Existing files retain their current responsibility and receive focused changes described below.

---

### Task 1: Customer domain and resolution rules

**Files:**

- Create: `server/domains/customers/customer-types.ts`
- Create: `server/domains/customers/customer-gateway.ts`
- Create: `server/domains/customers/customer-service.ts`
- Create: `server/domains/customers/customer-service.test.ts`
- Modify: `server/domains/orders/order-types.ts`

**Interfaces:**

- Consumes: normalized CPF as 11 digits and phone as 10 or 11 Brazilian digits.
- Produces: `Address`, `CustomerInput`, `ExternalCustomer`, `ResolvedCustomer`, `CustomerLookupResult`, `CustomerGateway`, and `CustomerService`.
- `CustomerService.lookup(criteria)` returns `{ found: false }` or `{ found: true, customer }`.
- `CustomerService.resolveForOrder(input)` returns an existing or new `ResolvedCustomer`, or throws `CUSTOMER_CONFLICT`.
- `CustomerService.ensureRegistered(customer)` creates only customers whose `registrationStatus` is `new`.

- [ ] **Step 1: Write failing customer resolution tests**

```ts
import { describe, expect, it } from 'vitest'
import { CustomerService } from './customer-service.js'
import type { CustomerGateway } from './customer-gateway.js'
import type { ExternalCustomer } from './customer-types.js'

const maria: ExternalCustomer = {
  externalId: '2015',
  name: 'Maria da Silva',
  cpf: '52998224725',
  phone: '84999855367',
}

function gateway(records: ExternalCustomer[]): CustomerGateway {
  return {
    findByCpf: async (cpf) => records.find((item) => item.cpf === cpf) ?? null,
    findByPhone: async (phone) => records.find((item) => item.phone === phone) ?? null,
    create: async () => undefined,
  }
}

describe('CustomerService', () => {
  it('resolves the same external person by CPF and phone', async () => {
    const service = new CustomerService(gateway([maria]))
    const result = await service.resolveForOrder({
      name: 'Nome digitado',
      cpf: maria.cpf,
      phone: maria.phone,
    })
    expect(result).toMatchObject({ externalId: '2015', registrationStatus: 'existing' })
  })

  it('rejects CPF and phone owned by different people', async () => {
    const service = new CustomerService(
      gateway([maria, { ...maria, externalId: '2020', cpf: '11144477735' }]),
    )
    await expect(
      service.resolveForOrder({ name: 'Cliente', cpf: '11144477735', phone: maria.phone }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CUSTOMER_CONFLICT' })
  })

  it('requires a complete address for a new person', async () => {
    const service = new CustomerService(gateway([]))
    await expect(
      service.resolveForOrder({ name: 'Cliente Novo', cpf: '11144477735', phone: '84999998888' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'ADDRESS_REQUIRED' })
  })
})
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npm test -- server/domains/customers/customer-service.test.ts`

Expected: FAIL because `customer-service.ts` and its exported types do not exist.

- [ ] **Step 3: Implement normalized customer types and service**

```ts
// server/domains/customers/customer-types.ts
import { z } from 'zod'

export const addressSchema = z.object({
  zipCode: z.string().regex(/^\d{8}$/),
  street: z.string().trim().min(1).max(160),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(80).optional(),
  neighborhood: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  state: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/),
})

export const customerInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  cpf: z.string().regex(/^\d{11}$/),
  phone: z.string().regex(/^\d{10,11}$/),
  address: addressSchema.optional(),
})

export const resolvedCustomerSchema = customerInputSchema.extend({
  externalId: z.string().min(1).optional(),
  registrationStatus: z.enum(['existing', 'new']),
})

export type Address = z.infer<typeof addressSchema>
export type CustomerInput = z.infer<typeof customerInputSchema>
export type ExternalCustomer = CustomerInput & { externalId: string }
export type ResolvedCustomer = z.infer<typeof resolvedCustomerSchema>
export type CustomerLookupResult = { found: false } | { found: true; customer: ExternalCustomer }
```

```ts
// server/domains/customers/customer-gateway.ts
import type { CustomerInput, ExternalCustomer } from './customer-types.js'

export interface CustomerGateway {
  findByCpf(cpf: string): Promise<ExternalCustomer | null>
  findByPhone(phone: string): Promise<ExternalCustomer | null>
  create(customer: CustomerInput): Promise<void>
}
```

Implement `CustomerService` so it performs both lookups, compares `externalId`, uses external canonical values when found, requires `addressSchema` when neither lookup resolves, and never converts gateway errors into a not-found result. Move order customer typing to `ResolvedCustomer` without importing an external DTO.

- [ ] **Step 4: Run customer tests and the full unit suite**

Run: `npm test -- server/domains/customers/customer-service.test.ts`

Expected: PASS for same-person resolution, conflict, lookup, and new-address validation.

Run: `npm test`

Expected: PASS with zero failed tests.

- [ ] **Step 5: Commit the customer domain**

```bash
git add server/domains/customers server/domains/orders/order-types.ts
git commit -m "feat: add customer resolution domain"
```

### Task 2: Live customer gateway and own-backend lookup route

**Files:**

- Create: `server/domains/customers/live-customer-gateway.ts`
- Create: `server/domains/customers/live-customer-gateway.test.ts`
- Create: `server/domains/customers/mock-customer-gateway.ts`
- Modify: `server/http/routes.ts`
- Modify: `server/app.ts`

**Interfaces:**

- Consumes: `CustomerGateway` and API responses shaped as `{ success: true, data: person }`.
- Produces: `GET /api/v1/customers/lookup?cpf=` and `?phone=` with the `CustomerLookupResult` union.
- `LiveCustomerGateway` maps `cep/endereco/numero/complemento/bairro/cidade/uf` to `Address`.

- [ ] **Step 1: Write failing adapter and route tests**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveCustomerGateway } from './live-customer-gateway.js'

afterEach(() => vi.unstubAllGlobals())

it('normalizes a person returned by phone', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            pessoas_id: 2015,
            nome: 'MARIA DA SILVA',
            cpf: '529.982.247-25',
            fone: '(84) 99985-5367',
            cep: '59062300',
            endereco: 'Avenida Lima e Silva',
            numero: '129',
            complemento: '',
            bairro: 'Nazaré',
            cidade: 'Natal',
            uf: 'RN',
          },
        }),
        { status: 200 },
      ),
    ),
  )

  const gateway = new LiveCustomerGateway('http://tickets.test')
  await expect(gateway.findByPhone('84999855367')).resolves.toMatchObject({
    externalId: '2015',
    cpf: '52998224725',
    phone: '84999855367',
    address: { zipCode: '59062300', state: 'RN' },
  })
})

it('maps external 404 to null but propagates external 500 as 502', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 404 }))
    .mockResolvedValueOnce(new Response('{"error":"database"}', { status: 500 }))
  vi.stubGlobal('fetch', fetchMock)
  const gateway = new LiveCustomerGateway('http://tickets.test')
  await expect(gateway.findByCpf('52998224725')).resolves.toBeNull()
  await expect(gateway.findByCpf('52998224725')).rejects.toMatchObject({ statusCode: 502 })
})
```

Add Fastify injection assertions that exactly one query parameter is required and that no CPF or phone appears in logs.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- server/domains/customers/live-customer-gateway.test.ts`

Expected: FAIL because live/mock gateways and lookup route are not implemented.

- [ ] **Step 3: Implement the live/mock gateways and route wiring**

```ts
const personResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    pessoas_id: z.union([z.string(), z.number().int()]).transform(String),
    nome: z.string(),
    cpf: z.string(),
    fone: z.string(),
    cep: z.string().nullish(),
    endereco: z.string().nullish(),
    numero: z.string().nullish(),
    complemento: z.string().nullish(),
    bairro: z.string().nullish(),
    cidade: z.string().nullish(),
    uf: z.string().nullish(),
  }),
})

const customerLookupQuerySchema = z
  .object({ cpf: z.string().optional(), phone: z.string().optional() })
  .refine((value) => Number(Boolean(value.cpf)) + Number(Boolean(value.phone)) === 1, {
    message: 'Informe CPF ou telefone, mas não ambos.',
  })
```

Use `fetch` directly for lookup so `404` can become `null`; parse all successful bodies with `personResponseSchema`. Use `fetchJson` for `POST /pessoa`. Build `MockCustomerGateway` with the deterministic Maria fixture and an in-memory map updated by `create`. Construct `CustomerService` in `buildApp`, inject it into `registerRoutes`, and register the lookup route.

- [ ] **Step 4: Run backend tests**

Run: `npm test -- server/domains/customers/live-customer-gateway.test.ts server/domains/customers/customer-service.test.ts server/domains/orders/order-service.test.ts`

Expected: PASS with no network access.

- [ ] **Step 5: Commit gateway and route**

```bash
git add server/domains/customers server/http/routes.ts server/app.ts
git commit -m "feat: expose customer lookup through backend"
```

### Task 3: Ticket API scoping and exact manual availability lookup

**Files:**

- Create: `server/domains/tickets/live-ticket-gateway.test.ts`
- Modify: `server/config/env.ts`
- Modify: `server/domains/tickets/ticket-gateway.ts`
- Modify: `server/domains/tickets/live-ticket-gateway.ts`
- Modify: `server/domains/tickets/mock-ticket-gateway.ts`
- Modify: `server/domains/orders/order-service.test.ts`
- Modify: `server/shared/fetch-json.ts`

**Interfaces:**

- Consumes: `raffleId` and ticket number selected by the user.
- Produces: `TicketGateway.getAvailableTicket(raffleId, ticketId): Promise<Ticket | null>`.
- Live config always resolves to `TICKET_ESTABLISHMENT_ID='4734'` and `TICKET_REGIONAL_ID='57'`.

- [ ] **Step 1: Write failing scope and lookup tests**

```ts
it('queries tickets with current contest and establishment 4734 only', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        success: true,
        data: [],
      }),
      { status: 200 },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  const gateway = new LiveTicketGateway(liveEnv)
  await gateway.getAvailableTickets('2026040')
  const url = new URL(String(fetchMock.mock.calls[0][0]))
  expect(url.searchParams.get('concurso_id')).toBe('2026040')
  expect(url.searchParams.get('estabelecimento_id')).toBe('4734')
  expect(url.searchParams.has('id_regional')).toBe(false)
})

it('uses the exact-number endpoint for a manual ticket', async () => {
  const gateway = new LiveTicketGateway(liveEnv)
  await gateway.getAvailableTicket('2026040', '000123')
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/bilhete/disponivel/numero?'),
    expect.anything(),
  )
})
```

Also assert that HTTP `404` returns `null` and the observed external `500` becomes `UPSTREAM_ERROR` with status `502` and the safe message `Serviço externo indisponível.` rather than the upstream database error.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- server/domains/tickets/live-ticket-gateway.test.ts`

Expected: FAIL because `getAvailableTicket` and fixed regional configuration do not exist.

- [ ] **Step 3: Implement strict config and ticket lookup**

```ts
TICKET_ESTABLISHMENT_ID: z.literal('4734').default('4734'),
TICKET_REGIONAL_ID: z.literal('57').default('57'),
```

```ts
export interface TicketGateway {
  getActiveRaffle(): Promise<Raffle>
  getAvailableTickets(raffleId: string): Promise<Ticket[]>
  getAvailableTicket(raffleId: string, ticketId: string): Promise<Ticket | null>
  fulfillOrder(order: Order): Promise<void>
}
```

Add a single-ticket response schema, issue the documented three query parameters, and map `404` to `null`. Remove person lookup/creation from `LiveTicketGateway.fulfillOrder`; customer registration now belongs to `CustomerService`. Change `fetchJson` so non-success external response bodies are never copied into public `DomainError` messages; preserve only safe status mapping and `UPSTREAM_ERROR`.

- [ ] **Step 4: Run ticket and order tests**

Run: `npm test -- server/domains/tickets/live-ticket-gateway.test.ts server/domains/orders/order-service.test.ts`

Expected: PASS, including explicit establishment and no regional query parameter.

- [ ] **Step 5: Commit ticket scoping**

```bash
git add server/config/env.ts server/domains/tickets server/domains/orders/order-service.test.ts server/shared/fetch-json.ts
git commit -m "feat: enforce Sol da Sorte ticket scope"
```

### Task 4: SQLite migrations and transactional reservation repository

**Files:**

- Create: `server/shared/database-migrations.ts`
- Create: `server/shared/database.test.ts`
- Create: `server/domains/orders/order-test-fixtures.ts`
- Modify: `server/shared/database.ts`
- Modify: `server/domains/orders/order-types.ts`
- Modify: `server/domains/orders/order-repository.ts`
- Modify: `server/domains/orders/order-service.test.ts`

**Interfaces:**

- Consumes: `OrderDraft`, manual `Ticket[]`, or shuffled random candidates plus quantity.
- Produces: `OrderRepository.createManual(order)`, `createRandom(draft, candidates, quantity)`, injectable `now(): Date`, and migrated schema version `2`.
- `createRandom` returns the persisted order containing the exact reserved items.

- [ ] **Step 1: Write failing migration and reservation tests**

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

it('upgrades an existing database without losing orders', () => {
  const directory = mkdtempSync(join(tmpdir(), 'comprar-bilhete-'))
  const path = join(directory, 'legacy.db')
  const legacy = new DatabaseSync(path)
  legacy.exec(`
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      raffle_id TEXT NOT NULL,
      raffle_title TEXT NOT NULL,
      status TEXT NOT NULL,
      total_in_cents INTEGER NOT NULL,
      customer_json TEXT NOT NULL,
      items_json TEXT NOT NULL,
      checkout_url TEXT,
      receipt_url TEXT,
      transaction_nsu TEXT,
      invoice_slug TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      paid_at TEXT
    );
    CREATE TABLE reservations (
      ticket_key TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE payment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      processed_at TEXT
    );
  `)
  legacy
    .prepare(
      `
    INSERT INTO orders (
      id, raffle_id, raffle_title, status, total_in_cents, customer_json,
      items_json, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      '00000000-0000-4000-8000-000000000001',
      'sorteio-setembro',
      'Sorteio de Setembro',
      'pending',
      1000,
      JSON.stringify(existingMaria),
      JSON.stringify([ticket('card-001')]),
      '2026-09-23T10:00:00.000Z',
      '2026-09-23T10:15:00.000Z',
    )
  legacy.close()
  const upgraded = createDatabase(path)
  expect(upgraded.prepare('SELECT id FROM orders').get()).toMatchObject({
    id: '00000000-0000-4000-8000-000000000001',
  })
  expect(upgraded.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 2 })
  upgraded.close()
  rmSync(directory, { recursive: true, force: true })
})

it('assigns distinct random tickets across consecutive reservations', () => {
  const repository = new OrderRepository(createDatabase(':memory:'))
  const first = repository.createRandom(orderDraft('first'), tickets, 2)
  const second = repository.createRandom(orderDraft('second'), tickets, 2)
  expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(4)
})

it('rolls back a random order when quantity cannot be completed', () => {
  const repository = new OrderRepository(createDatabase(':memory:'))
  const draft = orderDraft('order')
  expect(() => repository.createRandom(draft, tickets.slice(0, 1), 2)).toThrowError(
    expect.objectContaining({ code: 'INSUFFICIENT_TICKETS' }),
  )
  expect(repository.get(draft.id)).toBeNull()
})
```

Create `order-test-fixtures.ts` with `existingMaria`, `ticket(id)`, `orderDraft(id)`, and `order(overrides)` builders. Every builder must finish with `customerInputSchema.parse`, `ticketSchema.parse`, or `orderSchema.parse`; tests must not bypass production schemas.

- [ ] **Step 2: Run database tests and verify failure**

Run: `npm test -- server/shared/database.test.ts server/domains/orders/order-service.test.ts`

Expected: FAIL because migrations and random reservation methods are missing.

- [ ] **Step 3: Implement migrations and repository transactions**

```ts
// server/domains/orders/order-test-fixtures.ts
export const existingMaria = resolvedCustomerSchema.parse({
  externalId: '2015',
  registrationStatus: 'existing',
  name: 'Maria da Silva',
  cpf: '52998224725',
  phone: '84999855367',
})

const testOrderIds: Record<string, string> = {
  first: '00000000-0000-4000-8000-000000000001',
  second: '00000000-0000-4000-8000-000000000002',
  order: '00000000-0000-4000-8000-000000000003',
}

export function ticket(id: string): Ticket {
  return ticketSchema.parse({
    id,
    code: id,
    numbers: [1, 2, 3, 4, 5],
    validationBatch: 'mock',
    batchPosition: Number(id.replace(/\D/g, '')) || 1,
  })
}

export function orderDraft(id: string): OrderDraft {
  return orderDraftSchema.parse({
    id: testOrderIds[id] ?? id,
    raffleId: 'sorteio-setembro',
    raffleTitle: 'Sorteio de Setembro',
    selectionMode: 'random',
    status: 'pending',
    unitPriceInCents: 1000,
    totalInCents: 2000,
    customer: existingMaria,
    createdAt: '2026-09-23T10:00:00.000Z',
    expiresAt: '2026-09-23T10:15:00.000Z',
  })
}

export function order(overrides: Partial<Order> = {}): Order {
  const draft = orderDraft('first')
  return orderSchema.parse({
    ...draft,
    items: [ticket('card-001'), ticket('card-002')],
    ...overrides,
  })
}

export type OrderDraft = Omit<Order, 'items'>

createRandom(draft: OrderDraft, candidates: Ticket[], quantity: number): Order {
  this.database.exec('BEGIN IMMEDIATE')
  try {
    this.expirePendingWithinTransaction(this.now().toISOString())
    const items = candidates.filter((ticket) => !this.isReserved(draft.raffleId, ticket.id)).slice(0, quantity)
    if (items.length !== quantity) {
      throw new DomainError('Não há cartelas suficientes disponíveis.', 409, 'INSUFFICIENT_TICKETS')
    }
    const order = orderSchema.parse({ ...draft, items })
    this.insertOrderAndReservations(order)
    this.database.exec('COMMIT')
    return order
  } catch (error) {
    this.database.exec('ROLLBACK')
    throw error
  }
}
```

Implement `orderDraftSchema` from the same fields as `orderSchema` except `items`. Give `OrderRepository` a constructor argument `now: () => Date = () => new Date()` so expiry tests never sleep. Implement `createManual` with all-or-nothing conflict behavior. Change expiry cleanup so it removes reservations only for orders moved to `expired` or `cancelled`; preserve reservations for `processing` and `manual_review`.

Migration rules must distinguish an empty version-`0` database from the existing unversioned version-`0` schema: if `orders` exists, treat it as legacy version `1`; otherwise create the latest schema directly. Schema version `2` adds `selection_mode TEXT NOT NULL DEFAULT 'manual'`, `unit_price_in_cents INTEGER NOT NULL DEFAULT 0`, and customer-resolution metadata, then backfills `unit_price_in_cents` from `total_in_cents / json_array_length(items_json)` before removing reliance on the default. Task 6 owns schema version `3` and its payment-event columns and index.

- [ ] **Step 4: Run database and full backend tests**

Run: `npm test -- server/shared/database.test.ts server/domains/orders/order-service.test.ts`

Expected: PASS for legacy preservation, manual conflict, random uniqueness, rollback, and state-aware expiry.

Run: `npm test`

Expected: PASS with zero failed tests.

- [ ] **Step 5: Commit persistence changes**

```bash
git add server/shared/database.ts server/shared/database-migrations.ts server/shared/database.test.ts server/domains/orders
git commit -m "feat: reserve manual and random tickets atomically"
```

### Task 5: Order creation orchestration and public contract

**Files:**

- Modify: `server/domains/orders/order-types.ts`
- Modify: `server/domains/orders/order-service.ts`
- Modify: `server/domains/orders/order-service.test.ts`
- Modify: `server/http/order-presenter.ts`
- Modify: `server/http/routes.ts`
- Modify: `server/app.ts`
- Modify: `docs/API_CONTRACTS.md`

**Interfaces:**

- Consumes: `selection: { mode: 'manual'; cardIds: string[] } | { mode: 'random'; quantity: number }` and `CustomerInput`.
- Produces: order response with `items`, `selectionMode`, server total, expiry, and public status.
- Random quantity is an integer from `1` through `50`.

- [ ] **Step 1: Replace old create-order tests with failing discriminated-union tests**

```ts
it('reserves exact manual ticket ids', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    payload: {
      raffleId: 'sorteio-setembro',
      selection: { mode: 'manual', cardIds: ['card-001'] },
      customer: existingMaria,
    },
  })
  expect(response.statusCode).toBe(201)
  expect(response.json()).toMatchObject({
    selectionMode: 'manual',
    totalInCents: 1000,
    items: [{ id: 'card-001' }],
  })
})

it('allocates random tickets only in the backend', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    payload: {
      raffleId: 'sorteio-setembro',
      selection: { mode: 'random', quantity: 3 },
      customer: existingMaria,
    },
  })
  expect(response.statusCode).toBe(201)
  expect(response.json().items).toHaveLength(3)
})

it.each([0, 51, 1.5])('rejects invalid random quantity %s', async (quantity) => {
  const response = await createOrder({ mode: 'random', quantity })
  expect(response.statusCode).toBe(400)
})
```

Add `Promise.all` coverage proving two random orders receive disjoint item IDs and a manual collision returns `409 TICKET_RESERVED`.

- [ ] **Step 2: Run order tests and verify contract failure**

Run: `npm test -- server/domains/orders/order-service.test.ts`

Expected: FAIL because the route still accepts `cardIds` and the presenter omits items.

- [ ] **Step 3: Implement order orchestration**

```ts
export const orderSelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('manual'), cardIds: z.array(z.string().min(1)).min(1).max(50) }),
  z.object({ mode: z.literal('random'), quantity: z.number().int().min(1).max(50) }),
])

export const createOrderInputSchema = z.object({
  raffleId: z.string().min(1),
  selection: orderSelectionSchema,
  customer: customerInputSchema,
})
```

In `OrderService.createOrder`, resolve the customer, reload active raffle, reject stale raffle IDs, and construct an `OrderDraft` with `totalInCents` based only on server raffle price. Manual mode loads every exact ticket through `getAvailableTicket` and fails if any is unavailable. Random mode loads available candidates, performs a Fisher-Yates shuffle using `randomInt`, then calls `createRandom`. Expose only public ticket fields through `presentOrder`.

- [ ] **Step 4: Run order tests and architecture validation**

Run: `npm test -- server/domains/orders/order-service.test.ts`

Expected: PASS for manual, random, invalid quantity, conflict, customer resolution, and server-side totals.

Run: `npm run validate:architecture`

Expected: PASS with the new customer domain and unchanged frontend layer direction.

- [ ] **Step 5: Commit order orchestration**

```bash
git add server/domains/orders server/http server/app.ts docs/API_CONTRACTS.md
git commit -m "feat: create typed manual and random orders"
```

### Task 6: InfinitePay payload, webhook idempotency, and payment state safety

**Files:**

- Create: `server/domains/payments/infinitepay-gateway.test.ts`
- Modify: `server/domains/payments/infinitepay-gateway.ts`
- Modify: `server/domains/payments/payment-gateway.ts`
- Modify: `server/domains/orders/order-types.ts`
- Modify: `server/domains/orders/order-repository.ts`
- Modify: `server/domains/orders/order-service.ts`
- Modify: `server/domains/orders/order-service.test.ts`
- Modify: `server/shared/database-migrations.ts`
- Modify: `server/http/routes.ts`
- Modify: `server/app.ts`

**Interfaces:**

- Consumes: persisted order, validated webhook, and `PaymentReference`.
- Produces: idempotent event enqueue result `'created' | 'duplicate'`, stored payment metadata, and safe status transitions.
- `paid` is reachable only after exact-value `payment_check` and successful customer/ticket fulfillment.

- [ ] **Step 1: Write failing payment payload and reconciliation tests**

```ts
const infinitePayEnv = parseServerEnv({
  PAYMENT_PROVIDER: 'infinitepay',
  INFINITEPAY_HANDLE: 'helder-macedo',
})

const orderWithAddress = order({
  customer: resolvedCustomerSchema.parse({
    ...existingMaria,
    address: {
      zipCode: '59062300',
      street: 'Avenida Lima e Silva',
      number: '129',
      neighborhood: 'Nazaré',
      city: 'Natal',
      state: 'RN',
    },
  }),
})

const checkoutRequestSchema = z
  .object({
    order_nsu: z.string().uuid(),
    items: z.array(
      z.object({
        quantity: z.number().int().positive(),
        price: z.number().int().positive(),
        description: z.string().min(1),
      }),
    ),
    address: z.object({
      cep: z.string(),
      street: z.string(),
      neighborhood: z.string(),
      number: z.string(),
      complement: z.string().optional(),
    }),
  })
  .passthrough()

it('sends integer cents and normalized address to InfinitePay', async () => {
  const gateway = new InfinitePayGateway(infinitePayEnv)
  await gateway.createCheckout(orderWithAddress)
  const request = vi.mocked(fetch).mock.calls[0]
  const body = JSON.parse(String((request[1] as RequestInit).body)) as unknown
  expect(checkoutRequestSchema.parse(body)).toMatchObject({
    order_nsu: orderWithAddress.id,
    items: [{ quantity: 1, price: 1000 }],
    address: {
      cep: '59062300',
      street: 'Avenida Lima e Silva',
      neighborhood: 'Nazaré',
      number: '129',
    },
  })
})

it('deduplicates simultaneous webhook deliveries', async () => {
  const { app, paidWebhook, fulfillOrder } = await createPaymentHarness()
  const [first, second] = await Promise.all([
    app.inject({ method: 'POST', url: '/api/v1/webhooks/infinitepay', payload: paidWebhook }),
    app.inject({ method: 'POST', url: '/api/v1/webhooks/infinitepay', payload: paidWebhook }),
  ])
  expect([first.statusCode, second.statusCode]).toEqual([200, 200])
  await vi.waitFor(() => expect(fulfillOrder).toHaveBeenCalledTimes(1))
})

it('marks a late confirmed payment for manual review', async () => {
  let currentTime = new Date('2026-09-23T10:00:00.000Z')
  const { app, orderId, paidWebhook } = await createPaymentHarness(() => currentTime)
  currentTime = new Date('2026-09-23T10:16:00.000Z')
  await app.inject({ method: 'GET', url: `/api/v1/orders/${orderId}` })
  await app.inject({ method: 'POST', url: '/api/v1/webhooks/infinitepay', payload: paidWebhook })
  await vi.waitFor(async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/orders/${orderId}` })
    expect(response.json()).toMatchObject({
      status: 'manual_review',
    })
  })
  expect(
    (await app.inject({ method: 'GET', url: `/api/v1/orders/${orderId}` })).json(),
  ).toMatchObject({
    status: 'manual_review',
  })
})
```

Define `createPaymentHarness(now = () => new Date())` in `order-service.test.ts`. It builds the app with `MockCustomerGateway`, a spied `MockTicketGateway`, `MockPaymentGateway`, and the same `now` function passed through `buildApp` to `OrderRepository`; it creates an existing-customer manual order, creates its checkout, and returns `{ app, orderId, paidWebhook, fulfillOrder }`. Add a repository assertion that the late-payment row retains `transaction_nsu` and `paid_amount_in_cents`. Also test exact amount mismatch, duplicate redirect/webhook reconciliation, checkout URL reuse, and ticket fulfillment failure after a verified payment.

- [ ] **Step 2: Run payment tests and verify failure**

Run: `npm test -- server/domains/payments/infinitepay-gateway.test.ts server/domains/orders/order-service.test.ts`

Expected: FAIL because address, paid amount, capture method, unique event fields, and late-payment handling are absent.

- [ ] **Step 3: Implement payment persistence and state transitions**

```ts
export const paymentEventSchema = z.object({
  invoice_slug: z.string().min(1),
  amount: z.number().int().positive(),
  paid_amount: z.number().int().positive(),
  installments: z.number().int().positive(),
  capture_method: z.string().min(1),
  transaction_nsu: z.string().min(1),
  order_nsu: z.string().uuid(),
  receipt_url: z.url(),
  items: z.array(z.unknown()).default([]),
})
```

Add schema version `3` with columns `payment_events.transaction_nsu`, `payment_events.invoice_slug`, `orders.paid_amount_in_cents`, and `orders.capture_method`, plus the unique event index. Insert webhook metadata and payload in one transaction with `ON CONFLICT DO NOTHING`. Return HTTP `200` for both new and duplicate valid events. Before fulfillment, persist payment evidence. If the order is expired, cancelled, or lacks an active reservation, mark `manual_review` and do not call external ticket validation. For an active verified order, call `CustomerService.ensureRegistered(order.customer)` before `TicketGateway.fulfillOrder(order)`; either external failure becomes `manual_review`. Extend `AppOptions` with `now?: () => Date` and pass it to `OrderRepository`.

Update InfinitePay checkout mapping to include customer and address without email. Ensure each item price is the raffle unit price in integer cents; assert `order.totalInCents === unitPrice * itemCount` before the network call.

- [ ] **Step 4: Run payment and full backend tests**

Run: `npm test -- server/domains/payments/infinitepay-gateway.test.ts server/domains/orders/order-service.test.ts server/shared/database.test.ts`

Expected: PASS for payload, idempotency, exact amount, late payment, fulfillment failure, and migration.

Run: `npm test`

Expected: PASS with zero failed tests.

- [ ] **Step 5: Commit payment safety changes**

```bash
git add server/domains/payments server/domains/orders server/shared/database-migrations.ts server/http/routes.ts server/app.ts
git commit -m "feat: reconcile InfinitePay payments idempotently"
```

### Task 7: Frontend customer lookup boundary and dynamic validation

**Files:**

- Create: `src/features/checkout/repository/customer-repository.ts`
- Create: `src/features/checkout/runtime/use-customer-lookup.ts`
- Create: `src/features/checkout/runtime/use-customer-lookup.test.tsx`
- Create: `src/test/render-with-query.tsx`
- Modify: `src/features/checkout/domain/types.ts`
- Modify: `src/features/checkout/api/schemas.ts`
- Modify: `src/features/checkout/service/customer-schema.ts`
- Modify: `src/shared/config/api-routes.ts`
- Modify: `src/shared/api/http-client.ts`

**Interfaces:**

- Consumes: formatted CPF/phone values from the form.
- Produces: `customerRepository.lookup(criteria, signal)`, `useCustomerLookup`, `createCustomerSchema(addressRequired)`, and `ApiError.code`.
- The hook queries only a valid 11-digit CPF or 10/11-digit phone after 400 ms.

- [ ] **Step 1: Write failing hook, schema, and API error tests**

```tsx
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

const maria: ExternalCustomer = {
  externalId: '2015',
  name: 'Maria da Silva',
  cpf: '52998224725',
  phone: '84999855367',
}

function renderLookup(initialProps: LookupCriteria, repository: CustomerRepository) {
  const useLookup = createUseCustomerLookup(repository)
  return renderHook(({ criteria }) => useLookup(criteria), {
    initialProps: { criteria: initialProps },
    wrapper: createQueryWrapper(),
  })
}

it('keeps the newest lookup when an older request resolves late', async () => {
  const first = deferred<CustomerLookupResult>()
  const second = deferred<CustomerLookupResult>()
  repository.lookup.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const { result, rerender } = renderLookup({ cpf: '52998224725', phone: '' }, repository)
  rerender({ cpf: '', phone: '84999855367' })
  second.resolve({ found: true, customer: maria })
  await waitFor(() => expect(result.current.data).toMatchObject({ customer: maria }))
  first.resolve({ found: false })
  expect(result.current.data).toMatchObject({ customer: maria })
})

it('requires address only when requested by lookup state', () => {
  const base = { name: 'Cliente Novo', cpf: '111.444.777-35', phone: '(84) 99999-8888' }
  expect(createCustomerSchema(false).safeParse(base).success).toBe(true)
  expect(createCustomerSchema(true).safeParse(base).success).toBe(false)
  expect(
    createCustomerSchema(true).safeParse({
      ...base,
      address: {
        zipCode: '59062300',
        street: 'Rua A',
        number: '10',
        neighborhood: 'Centro',
        city: 'Natal',
        state: 'RN',
      },
    }).success,
  ).toBe(true)
})
```

Add a `requestJson` test that parses `{ message, code }` from a `409` response into `ApiError.status` and `ApiError.code`.

- [ ] **Step 2: Run focused frontend tests and verify failure**

Run: `npm test -- src/features/checkout/runtime/use-customer-lookup.test.tsx src/features/checkout/service/customer-schema.test.ts src/shared/api/http-client.test.ts`

Expected: FAIL because the hook, dynamic schema, lookup repository, and API code are absent.

- [ ] **Step 3: Implement frontend customer boundary**

```ts
export const addressSchema = z.object({
  zipCode: z.string().transform(onlyDigits).pipe(z.string().length(8, 'Informe um CEP válido.')),
  street: z.string().trim().min(1, 'Informe o endereço.'),
  number: z.string().trim().min(1, 'Informe o número.'),
  complement: z.string().trim().optional(),
  neighborhood: z.string().trim().min(1, 'Informe o bairro.'),
  city: z.string().trim().min(1, 'Informe a cidade.'),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Informe a UF.'),
})
export type Address = z.infer<typeof addressSchema>

export type LookupCriteria = { cpf?: string; phone?: string }
export type ExternalCustomer = {
  externalId: string
  name: string
  cpf: string
  phone: string
  address?: Address
}
export type CustomerLookupResult = { found: false } | { found: true; customer: ExternalCustomer }

export interface CustomerRepository {
  lookup(criteria: LookupCriteria, signal?: AbortSignal): Promise<CustomerLookupResult>
}

export const externalCustomerSchema = z.object({
  externalId: z.string().min(1),
  name: z.string(),
  cpf: z.string(),
  phone: z.string(),
  address: addressSchema.optional(),
})

export const customerLookupSchema = z.discriminatedUnion('found', [
  z.object({ found: z.literal(false) }),
  z.object({ found: z.literal(true), customer: externalCustomerSchema }),
])

const liveCustomerRepository: CustomerRepository = {
  lookup(criteria: { cpf?: string; phone?: string }, signal?: AbortSignal) {
    return requestJson(apiRoutes.customerLookup(criteria), customerLookupSchema, { signal })
  },
}

const mockMaria: ExternalCustomer = {
  externalId: '2015',
  name: 'Maria da Silva',
  cpf: '52998224725',
  phone: '84999855367',
}

const mockCustomerRepository: CustomerRepository = {
  async lookup(criteria) {
    await new Promise((resolve) => window.setTimeout(resolve, 250))
    return criteria.cpf === '52998224725' || criteria.phone === '84999855367'
      ? { found: true, customer: mockMaria }
      : { found: false }
  },
}

export const customerRepository =
  env.VITE_API_MODE === 'live' ? liveCustomerRepository : mockCustomerRepository
```

```ts
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
```

```ts
export function createCustomerSchema(addressRequired: boolean) {
  return customerBaseSchema.superRefine((value, context) => {
    if (!addressRequired) return
    const result = addressSchema.safeParse(value.address)
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({ ...issue, path: ['address', ...issue.path] })
      }
    }
  })
}
```

```tsx
export function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}
```

Define `mockMaria` with the same public fields as the backend mock fixture. Implement `createQueryWrapper()` in `src/test/render-with-query.tsx`; each call creates a new `QueryClient` with retries disabled and returns a component wrapping children in `QueryClientProvider`. Implement `createUseCustomerLookup(repository: CustomerRepository)` and export its production instance as `useCustomerLookup`. The hook uses a 400 ms debounced normalized criterion and TanStack Query's `signal`. Update `requestJson` to validate error bodies with Zod and preserve safe `code` values.

- [ ] **Step 4: Run frontend unit tests**

Run: `npm test -- src/features/checkout/runtime/use-customer-lookup.test.tsx src/features/checkout/service/customer-schema.test.ts src/shared/api/http-client.test.ts`

Expected: PASS for debounce, cancellation, address validation, and error codes.

Run: `npm run validate:architecture`

Expected: PASS; runtime depends only on service/repository/domain layers.

- [ ] **Step 5: Commit frontend lookup boundary**

```bash
git add src/features/checkout src/shared/config/api-routes.ts src/shared/api/http-client.ts src/shared/api/http-client.test.ts
git commit -m "feat: add typed customer lookup client"
```

### Task 8: Random cart intent and accessible checkout page

**Files:**

- Create: `src/features/cart/runtime/CartProvider.test.tsx`
- Create: `src/pages/CartPage.test.tsx`
- Modify: `src/features/cart/domain/types.ts`
- Modify: `src/features/cart/runtime/cart-context.ts`
- Modify: `src/features/cart/runtime/CartProvider.tsx`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/pages/CartPage.tsx`
- Modify: `src/features/checkout/service/checkout-service.ts`
- Modify: `src/features/checkout/repository/checkout-repository.ts`
- Modify: `src/features/checkout/api/schemas.ts`
- Modify: `src/features/checkout/domain/types.ts`
- Modify: `src/app/styles.css`

**Interfaces:**

- Consumes: `Cart.selection`, lookup state, and `ApiError.code`.
- Produces: manual `{ mode: 'manual'; cards }` or random `{ mode: 'random'; quantity }` browser intent; checkout submits backend selection union.
- Browser storage contains raffle and public selection data only.

- [ ] **Step 1: Write failing cart and page tests**

```tsx
const mockCard: RaffleCard = {
  id: 'card-001',
  code: '#001',
  numbers: [1, 2, 3, 4, 5],
  available: true,
}

const mockRaffle: Raffle = {
  id: 'sorteio-setembro',
  title: 'Sorteio de Setembro',
  description: 'Sorteio de teste',
  prize: 'R$ 10.000 em prêmios',
  drawDate: '2026-09-30T21:00:00.000Z',
  priceInCents: 1000,
  cards: [mockCard],
}

const manualCartFixture: Cart = {
  raffleId: mockRaffle.id,
  raffleTitle: mockRaffle.title,
  priceInCents: mockRaffle.priceInCents,
  selection: { mode: 'manual', cards: [mockCard] },
}

vi.mock('../features/checkout/repository/customer-repository', () => ({
  customerRepository: { lookup: vi.fn() },
}))

vi.mock('../features/checkout/repository/checkout-repository', () => ({
  checkoutRepository: {
    createOrder: vi.fn(),
    createCheckout: vi.fn(),
    getOrder: vi.fn(),
  },
}))

function CartHarness() {
  const { cart, setSelection } = useCart()
  return (
    <>
      <button
        type="button"
        onClick={() => setSelection(mockRaffle, { mode: 'random', quantity: 3 })}
      >
        Selecionar 3 cartelas
      </button>
      <output data-testid="cart">{JSON.stringify(cart)}</output>
    </>
  )
}

function renderCartProviderHarness() {
  return render(
    <CartProvider>
      <CartHarness />
    </CartProvider>,
  )
}

function readCart() {
  return JSON.parse(screen.getByTestId('cart').textContent ?? 'null') as unknown
}

const maria: ExternalCustomer = {
  externalId: '2015',
  name: 'Maria da Silva',
  cpf: '52998224725',
  phone: '84999855367',
}

function renderCartPage() {
  localStorage.setItem('bilhete-da-sorte:cart:v2', JSON.stringify(manualCartFixture))
  return render(
    <MemoryRouter initialEntries={['/carrinho']}>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      >
        <CartProvider>
          <Routes>
            <Route path="/carrinho" element={<CartPage />} />
            <Route path="/" element={<HomePage />} />
          </Routes>
        </CartProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

async function submitValidExistingCustomer() {
  await userEvent.type(screen.getByLabelText('CPF'), '52998224725')
  await waitFor(() => expect(screen.getByText('Cliente encontrado')).toBeVisible())
  await userEvent.click(screen.getByRole('button', { name: /continuar para o pix/i }))
}

it('stores random quantity without preselecting ticket ids', async () => {
  const user = userEvent.setup()
  renderCartProviderHarness()
  await user.click(screen.getByRole('button', { name: 'Selecionar 3 cartelas' }))
  expect(readCart()).toMatchObject({ selection: { mode: 'random', quantity: 3 } })
  expect(JSON.stringify(readCart())).not.toContain('card-')
})

it('fills an existing customer and keeps an absent required field editable', async () => {
  vi.mocked(customerRepository.lookup).mockResolvedValue({
    found: true,
    customer: { ...maria, cpf: '' },
  })
  renderCartPage()
  await userEvent.type(screen.getByLabelText('Celular com DDD'), '84999855367')
  expect(await screen.findByText('Cliente encontrado')).toBeVisible()
  expect(screen.getByLabelText('Nome completo')).toHaveValue('Maria da Silva')
  expect(screen.getByLabelText('CPF')).toBeEnabled()
  expect(screen.queryByLabelText('CEP')).not.toBeInTheDocument()
})

it('shows required address fields for a new customer', async () => {
  vi.mocked(customerRepository.lookup).mockResolvedValue({ found: false })
  renderCartPage()
  await userEvent.type(screen.getByLabelText('CPF'), '11144477735')
  expect(await screen.findByText('Complete seu endereço')).toBeVisible()
  expect(screen.getByLabelText('CEP')).toBeRequired()
  expect(screen.getByLabelText('UF')).toHaveAttribute('maxLength', '2')
})

it('returns to refreshed selection after a reservation conflict', async () => {
  vi.mocked(checkoutRepository.createOrder).mockRejectedValue(
    new ApiError('Cartela reservada.', 409, 'TICKET_RESERVED'),
  )
  renderCartPage()
  await submitValidExistingCustomer()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Uma ou mais cartelas foram reservadas por outra pessoa.',
  )
})
```

Add loading, lookup failure with retry, keyboard submission, random summary, and address-error focus assertions.

- [ ] **Step 2: Run page tests and verify failure**

Run: `npm test -- src/features/cart/runtime/CartProvider.test.tsx src/pages/CartPage.test.tsx`

Expected: FAIL because cart selection is card-array-only and the checkout has no lookup/address UI.

- [ ] **Step 3: Implement cart union and page flow**

```ts
export type CartSelection =
  { mode: 'manual'; cards: RaffleCard[] } | { mode: 'random'; quantity: number }

export type Cart = {
  raffleId: string
  raffleTitle: string
  priceInCents: number
  selection: CartSelection
}
```

Version local storage as `bilhete-da-sorte:cart:v2`; invalid v1 data may be discarded because it contains no personal or paid state. Update `HomePage` so random mode stores only quantity. Update `startCheckout` to map manual cards to `cardIds` and random intent to `quantity`.

In `CartPage`, use `useCustomerLookup`, reset only server-returned fields with React Hook Form, render an `aria-live="polite"` lookup status, conditionally mount address fields, and rebuild the resolver when address requirement changes. Disable submission while a lookup is pending or failed. On `TICKET_RESERVED` or `INSUFFICIENT_TICKETS`, clear cart, invalidate `['active-raffle']`, and navigate home with an accessible notice. Give the two mode controls `tablist`/`tab` semantics and their content `tabpanel` semantics without changing keyboard button behavior.

Add CSS using existing tokens and the existing mobile breakpoint; address fields collapse to one column at 360 px and all controls retain visible focus.

- [ ] **Step 4: Run frontend tests and build**

Run: `npm test -- src/features/cart/runtime/CartProvider.test.tsx src/pages/CartPage.test.tsx src/features/checkout/runtime/use-customer-lookup.test.tsx`

Expected: PASS for manual/random cart, lookup states, existing/new customer, conflict, and accessibility assertions.

Run: `npm run build`

Expected: exit code `0` with strict TypeScript compilation.

- [ ] **Step 5: Commit checkout UI**

```bash
git add src/features/cart src/features/checkout src/pages/HomePage.tsx src/pages/CartPage.tsx src/pages/CartPage.test.tsx src/app/styles.css
git commit -m "feat: complete customer checkout experience"
```

### Task 9: End-to-end journeys, documentation, and final verification

**Files:**

- Modify: `tests/e2e/purchase.spec.ts`
- Modify: `docs/PRODUCT.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/FRONTEND.md`
- Modify: `docs/BACKEND.md`
- Modify: `docs/API_CONTRACTS.md`
- Modify: `docs/SECURITY.md`
- Modify: `docs/RELIABILITY.md`
- Modify: `docs/QUALITY_SCORE.md`
- Modify: `docs/exec-plans/active/2026-09-23-checkout-payment.md`

**Interfaces:**

- Consumes: complete mock-backed application and all contracts from Tasks 1-8.
- Produces: browser-level acceptance evidence for desktop and Pixel 7 projects, updated durable documentation, and a completed execution plan.

- [ ] **Step 1: Write failing E2E journeys**

```ts
import type { Page } from '@playwright/test'

async function fillAddress(page: Page) {
  await page.getByLabel('CEP').fill('59062300')
  await page.getByLabel('Endereço').fill('Avenida Lima e Silva')
  await page.getByLabel('Número').fill('129')
  await page.getByLabel('Complemento').fill('Casa')
  await page.getByLabel('Bairro').fill('Nazaré')
  await page.getByLabel('Cidade').fill('Natal')
  await page.getByLabel('UF').fill('RN')
}

test('existing customer buys a manually selected ticket', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Escolher cartelas' }).click()
  await page.getByRole('button', { name: /cartela #001/i }).click()
  await page.getByRole('button', { name: /ir para o carrinho/i }).click()
  await page.getByLabel('CPF').fill('52998224725')
  await expect(page.getByText('Cliente encontrado')).toBeVisible()
  await page.getByRole('button', { name: /continuar para o pix/i }).click()
  await expect(page.getByRole('heading', { name: /suas cartelas estão garantidas/i })).toBeVisible({
    timeout: 12_000,
  })
})

test('reports a ticket reserved by another checkout', async ({ page, request }) => {
  const reserved = await request.post('http://127.0.0.1:3333/api/v1/orders', {
    data: {
      raffleId: 'sorteio-setembro',
      selection: { mode: 'manual', cardIds: ['card-010'] },
      customer: {
        name: 'Maria da Silva',
        cpf: '52998224725',
        phone: '84999855367',
      },
    },
  })
  expect(reserved.status()).toBe(201)
  await page.goto('/')
  await page.getByRole('tab', { name: 'Escolher cartelas' }).click()
  await page.getByRole('button', { name: /cartela #010/i }).click()
  await page.getByRole('button', { name: /ir para o carrinho/i }).click()
  await page.getByLabel('CPF').fill('52998224725')
  await expect(page.getByText('Cliente encontrado')).toBeVisible()
  await page.getByRole('button', { name: /continuar para o pix/i }).click()
  await expect(page.getByRole('alert')).toContainText('reservadas por outra pessoa')
})

test('new customer buys random tickets with required address', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '3' }).click()
  await page.getByRole('button', { name: /ir para o carrinho/i }).click()
  await page.getByLabel('Nome completo').fill('Cliente Novo')
  await page.getByLabel('CPF').fill('11144477735')
  await page.getByLabel('Celular com DDD').fill('84999998888')
  await expect(page.getByText('Complete seu endereço')).toBeVisible()
  await fillAddress(page)
  await page.getByRole('button', { name: /continuar para o pix/i }).click()
  await expect(page.getByRole('heading', { name: /suas cartelas estão garantidas/i })).toBeVisible({
    timeout: 12_000,
  })
})
```

Keep the conflict test before the random journey so the deterministic mock inventory cannot consume its chosen card first.

- [ ] **Step 2: Run E2E tests and verify any missing acceptance behavior**

Run: `npm run test:e2e`

Expected before final fixes: at least one new journey fails on a missing selector, mock fixture, conflict notice, or form behavior. Confirm the failure is from the added acceptance requirement, not test setup.

- [ ] **Step 3: Make minimal E2E-facing fixes and update documentation**

Keep product fixes limited to failures demonstrated in Step 2. Update documentation with these exact durable statements:

```markdown
- Customer lookup is proxied by `GET /api/v1/customers/lookup`; the browser never calls the ticket API.
- Random checkout sends only a quantity; the backend assigns and reserves ticket IDs transactionally.
- Establishment `4734` is the external filter for regional `57`; the external API has no regional query parameter.
- Webhooks are durable and idempotent but require `payment_check` before paid fulfillment.
- Pix must be enabled in the InfinitePay merchant checkout settings; the documented `/links` payload does not force a payment method.
```

Record dated progress and every verification result in this plan. Update `docs/QUALITY_SCORE.md` only from observed tests and remaining risks, including the external `/bilhete/disponiveis` HTTP `500` seen on 23/09/2026.

- [ ] **Step 4: Run mandatory verification from a clean application process**

Run: `npm run check`

Expected: lint, formatting check, architecture validation, docs validation, Vitest, TypeScript, and Vite build all exit `0`.

Run: `npm run test:e2e`

Expected: all Chromium desktop and Pixel 7 journeys pass with zero failures.

Run: `git diff --check`

Expected: exit code `0` and no whitespace errors.

- [ ] **Step 5: Review requirements and move the plan to completed**

Confirm every spec heading maps to a completed task and record command outputs under `Validation Results`. Then move:

```text
docs/exec-plans/active/2026-09-23-checkout-payment.md
docs/exec-plans/completed/2026-09-23-checkout-payment.md
```

Commit only task-owned files:

```bash
git add tests/e2e/purchase.spec.ts docs ARCHITECTURE.md
git commit -m "test: verify checkout and payment journeys"
```

## Decisions

- Chosen: preserve separate order and checkout endpoints so checkout creation can be retried without duplicate orders.
- Chosen: represent manual and random selection as a discriminated union shared conceptually across frontend and backend.
- Chosen: resolve customers again at order creation because browser lookup state is untrusted.
- Chosen: use `BEGIN IMMEDIATE` plus a unique reservation key for local exclusivity.
- Chosen: preserve paid-but-undeliverable evidence in `manual_review`.
- Rejected: frontend-owned random ticket IDs, direct browser InfinitePay calls, payment confirmation from redirect, and customer creation before verified payment.

## Progress

- 2026-09-23: Design approved and committed as `dc46dcb`.
- 2026-09-23: Implementation plan written; implementation not started.

## Validation Results

- 2026-09-23: `npm run validate:docs` passed for the design document.
- Implementation verification remains pending until Tasks 1-9 are executed.
