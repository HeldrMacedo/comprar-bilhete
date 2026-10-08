# Concorrência na reserva de bilhetes (coluna `reservado`) — plano de implementação

> **Para agentes:** use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** impedir que o mesmo bilhete seja vendido por dois canais ao mesmo tempo, usando `bilhete.reservado`/`bilhete.data_reservado` da API de bilhetes como trava com expiração, e marcar `validado` somente depois que o pagamento for confirmado — com tudo pronto e desligado até os endpoints de reserva existirem.

**Arquitetura:** duas camadas de trava. A reserva local no SQLite (já existente, `reservations.ticket_key` único) serializa pedidos deste backend. Uma nova porta `TicketReservationGateway` faz a trava remota com _compare-and-set_ (atualização condicional) na coluna `reservado`, usando `data_reservado` como token de posse e como início do prazo (lease). Um coordenador persiste cada trava remota em `remote_reservations`, desfaz travas parciais, libera travas de pedidos expirados/cancelados pelo worker e confere a posse antes de chamar `PUT /bilhete/validar`. O provider padrão é `none` (null object), então o comportamento atual não muda até a ativação.

**Stack:** Fastify, TypeScript estrito, Zod, SQLite nativo do Node (`node:sqlite`), Vitest.

**Spec:** este documento (seções "Contexto", "Técnica de concorrência" e "Decisões"). A Tarefa 8 registra a decisão durável em `docs/design-docs/`.

## Restrições globais

- TypeScript estrito; sem `any` e sem forçar tipo de resposta externa — toda resposta da API de bilhetes passa por Zod.
- Dinheiro continua em centavos inteiros; este plano não mexe em preço.
- Somente o backend confirma pagamento; `validado` só é gravado após `payment_check` pago com valor exato.
- `manual_review` nunca aparece como sucesso.
- Textos de usuário, comentários e documentação em português brasileiro.
- Nada novo em variáveis `VITE_*`; nenhuma mudança de frontend é necessária (o código `TICKET_RESERVED` já é tratado por `isReservationConflict` em `src/features/checkout/service/checkout-service.ts`).
- `npm run check` obrigatório ao final; `npm run test:e2e` também, porque a criação de pedido faz parte da jornada.
- `TICKET_RESERVATION_PROVIDER` padrão `none`: com ele, o sistema se comporta exatamente como hoje.

---

## Contexto consultado

- `tabela_bilhete.md`: tabela MySQL/InnoDB `bilhete`, PK `(concurso_id, numero)`. Colunas relevantes: `reservado BIT(1)`, `data_reservado DATETIME`, `validado BIT(1)`, `data_validacao DATETIME`, `devolvido BIT(1)`, `estabelecimento_id`, `lote_validacao`, `posicao_lote`. Não existe coluna de "dono" da reserva.
- `server/domains/tickets/live-ticket-gateway.ts`: leitura por `GET /bilhete/disponiveis` e `GET /bilhete/disponivel/numero`; entrega por `PUT /bilhete/validar` (é o que grava `validado`).
- `server/domains/orders/order-repository.ts`: reserva local em transação `BEGIN IMMEDIATE`; `expirePendingWithinTransaction` expira pedidos e apaga reservas.
- `server/domains/orders/order-service.ts`: `createOrder`/`createGroupedOrder` reservam localmente; `reconcile` faz `payment_check` → `tryStartProcessing` → `ensureRegistered` → `fulfillOrder` → `markPaid`, ou `manual_review` em falha.
- `docs/API_CONTRACTS.md` e `docs/BACKEND.md`: registram que a API externa não oferece reserva; outro canal pode vender o bilhete entre seleção e pagamento.
- Endpoints de reserva (`PUT`/`GET` sobre `reservado`) **ainda não existem**. O contrato abaixo é provisório e fica concentrado em um único arquivo.

## Técnica de concorrência

### Por que não "ler e depois gravar"

`GET` do bilhete seguido de `PUT reservado=1` tem janela de corrida: dois canais leem `reservado=0` e ambos gravam `1`. A trava só é real se a verificação e a escrita forem **a mesma instrução** no MySQL. Também não serve `SELECT ... FOR UPDATE` mantido entre chamadas HTTP: a trava de linha ficaria presa durante o checkout.

### Contrato pedido à equipe da API de bilhetes

Reservar (`PUT`, `reservado: true`) — atualização condicional; a PK `(concurso_id, numero)` faz o InnoDB travar uma única linha:

```sql
SET @agora = NOW();
UPDATE bilhete
SET reservado = b'1', data_reservado = @agora
WHERE concurso_id = ? AND numero = ? AND estabelecimento_id = ?
  AND (validado IS NULL OR validado = b'0')
  AND (devolvido IS NULL OR devolvido = b'0')
  AND (reservado IS NULL OR reservado = b'0'
       OR data_reservado < @agora - INTERVAL :ttl_minutos MINUTE);
-- 1 linha afetada: 200 { "success": true, "data_reservado": "<@agora>" }
-- 0 linhas: 409
```

Liberar (`PUT`, `reservado: false`) — só quem tem o token libera:

```sql
UPDATE bilhete
SET reservado = b'0', data_reservado = NULL
WHERE concurso_id = ? AND numero = ? AND estabelecimento_id = ?
  AND reservado = b'1' AND data_reservado = ?
  AND (validado IS NULL OR validado = b'0');
-- 1 linha: 200 { "success": true }; 0 linhas: 409
```

Consultar (`GET`): `{ "success": true, "reservado": 0|1|true|false|null, "data_reservado": "YYYY-MM-DD HH:mm:ss" | null, "validado": 0|1|true|false|null }`; `404` se o bilhete não existir.

Desejável (não bloqueia este plano): `PUT /bilhete/validar` também condicional a `validado = 0`, respondendo `409` se já validado.

Caminho provisório adotado: `PUT /bilhete/reservado` e `GET /bilhete/reservado?concurso_id=&numero=&estabelecimento_id=`, corpo do `PUT` com `numero`, `concurso_id`, `estabelecimento_id`, `reservado` e (na liberação) `data_reservado`.

### Fluxo no backend

1. **Criar pedido:** reserva local (transação SQLite, como hoje) → `coordinator.acquire(order)` reserva cada bilhete remotamente em ordem `(raffleId, numero)`. Cada sucesso vira linha `held` em `remote_reservations` com o token.
   - Conflito (`409`) em qualquer bilhete: libera as já obtidas, cancela o pedido local (apaga reservas locais) e responde `409 TICKET_RESERVED`.
   - Erro de rede/5xx: mesma compensação e responde `502`.
2. **Pagamento confirmado:** após `tryStartProcessing`, `coordinator.confirmOwnership(order)` faz `GET` de cada bilhete e exige `reservado=1`, `validado=0` e `data_reservado` igual ao token. Se perdeu a posse: `manual_review`, sem `PUT /bilhete/validar`. Se manteve: `ensureRegistered` → `fulfillOrder` (`PUT /bilhete/validar`, que grava `validado`) → `markPaid` → linhas viram `validated`.
3. **Expiração/cancelamento:** o worker (a cada 5 s) expira pedidos e libera as travas `held` de pedidos `expired`/`cancelled`. Falha de liberação mantém `held` com `last_error` e tenta de novo; o TTL externo é a rede de segurança.
4. **Listagem:** se `/bilhete/disponiveis` ou `/bilhete/disponivel/numero` passarem a devolver `reservado`/`data_reservado`/`validado`, bilhetes validados ou com reserva dentro do TTL são omitidas.

Regra de prazo: `TICKET_RESERVATION_TTL_MINUTES` (padrão 30) precisa ser maior que `ORDER_EXPIRATION_MINUTES` (padrão 15) e igual ao `ttl_minutos` configurado na API de bilhetes, para a trava remota durar enquanto o pedido ainda aceita pagamento e processamento.

## Decisões

- **Token de posse = `data_reservado`.** A tabela não tem coluna de dono; o valor gravado na reserva identifica quem reservou. Risco residual: precisão de segundos. Se a resposta de uma liberação se perder e, no mesmo segundo, outro canal reservar o bilhete, um reenvio poderia liberar a trava alheia. Registrado como dívida; a solução definitiva é a API aceitar um token próprio (coluna nova ou reutilizar `numorder`).
- **Reserva remota fora da transação SQLite.** `node:sqlite` é síncrono; manter `BEGIN IMMEDIATE` aberto durante HTTP bloquearia todas as escritas. Por isso: grava local, depois trava remota, e compensa com `cancel` em falha.
- **Ordem determinística** `(raffleId, numero)` nas reservas remotas, para reduzir disputa entre pedidos com bilhetes em comum.
- **Provider `none` como null object** (`NoopTicketReservationGateway`): o serviço sempre passa pelo coordenador; nenhuma ramificação `if (habilitado)` espalhada.
- **Pedidos legados** (criados antes da ativação, sem linhas em `remote_reservations`) seguem o fluxo atual na confirmação, para não cair em `manual_review` no deploy.
- **Descartado:** retentar surpresinha com outro bilhete em conflito externo (complexidade de reescrever itens do pedido; vira dívida). Descartado `SELECT ... FOR UPDATE` remoto (trava presa entre requisições). Descartado "ler e depois gravar" (corrida).

## Critérios de aceite

- Com `TICKET_RESERVATION_PROVIDER=none`, todos os testes atuais passam sem alteração de comportamento.
- Com provider `mock`: bilhete reservado por outro canal gera `409 TICKET_RESERVED`, sem reserva local nem remota remanescente.
- Pagamento com trava remota perdida vai para `manual_review` e não chama `PUT /bilhete/validar`.
- Pedido expirado tem sua trava remota liberada pelo worker.
- Provider `live` monta as requisições do contrato provisório e trata `200`/`409`/`404`/`5xx`, validado por testes com `fetch` simulado.
- `npm run check` e `npm run test:e2e` passam.

## Mapa de arquivos

| Arquivo                                                            | Responsabilidade                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `server/config/env.ts` (mod.)                                      | `TICKET_RESERVATION_PROVIDER`, `TICKET_RESERVATION_TTL_MINUTES` e regras |
| `server/domains/tickets/ticket-reservation-gateway.ts` (novo)      | porta e tipos                                                            |
| `server/domains/tickets/noop-ticket-reservation-gateway.ts` (novo) | provider `none`                                                          |
| `server/domains/tickets/mock-ticket-reservation-gateway.ts` (novo) | provider `mock`, CAS em memória                                          |
| `server/domains/tickets/ticket-api-fields.ts` (novo)               | `bitSchema` e data sem fuso da API de bilhetes                           |
| `server/domains/tickets/live-ticket-reservation-gateway.ts` (novo) | provider `live`, contrato provisório                                     |
| `server/shared/database-migrations.ts` (mod.)                      | schema v4 com `remote_reservations`                                      |
| `server/domains/orders/remote-reservation-repository.ts` (novo)    | persistência das travas remotas                                          |
| `server/domains/orders/order-repository.ts` (mod.)                 | `cancel` e `expirePending` público                                       |
| `server/domains/orders/ticket-reservation-coordinator.ts` (novo)   | adquirir, compensar, conferir posse, liberar                             |
| `server/domains/orders/order-service.ts` (mod.)                    | integra coordenador na criação e na reconciliação                        |
| `server/app.ts` (mod.)                                             | seleção do provider e worker de liberação                                |
| `server/domains/tickets/live-ticket-gateway.ts` (mod.)             | omite bilhetes reservados/validadas na listagem                          |

---

### Tarefa 1: Configuração da reserva externa

**Arquivos:**

- Modificar: `server/config/env.ts`
- Modificar: `server/config/env.test.ts`
- Modificar: `server/domains/orders/order-service.test.ts:9-23` (objeto literal `env: ServerEnv`)
- Modificar: `.env.example`

**Interfaces:**

- Produz: `ServerEnv['TICKET_RESERVATION_PROVIDER']: 'none' | 'mock' | 'live'` e `ServerEnv['TICKET_RESERVATION_TTL_MINUTES']: number`.

- [x] **Passo 1: testes que falham** — acrescentar ao fim de `server/config/env.test.ts`:

```ts
it('mantém a reserva externa desligada por padrão', () => {
  const env = parseServerEnv({})
  expect(env.TICKET_RESERVATION_PROVIDER).toBe('none')
  expect(env.TICKET_RESERVATION_TTL_MINUTES).toBe(30)
})

it('exige TICKET_PROVIDER=live para a reserva externa live', () => {
  expect(() => parseServerEnv({ TICKET_RESERVATION_PROVIDER: 'live' })).toThrow()
  expect(
    parseServerEnv({ TICKET_PROVIDER: 'live', TICKET_RESERVATION_PROVIDER: 'live' })
      .TICKET_RESERVATION_PROVIDER,
  ).toBe('live')
})

it('exige prazo da reserva externa maior que a expiração do pedido', () => {
  expect(() =>
    parseServerEnv({
      TICKET_RESERVATION_PROVIDER: 'mock',
      ORDER_EXPIRATION_MINUTES: '15',
      TICKET_RESERVATION_TTL_MINUTES: '15',
    }),
  ).toThrow()
})
```

- [x] **Passo 2: confirmar falha** — `npx vitest run server/config/env.test.ts`. Esperado: FAIL (`TICKET_RESERVATION_PROVIDER` indefinido).

- [x] **Passo 3: implementar** — em `server/config/env.ts`, após `TICKET_REGIONAL_ID`:

```ts
    TICKET_RESERVATION_PROVIDER: z.enum(['none', 'mock', 'live']).default('none'),
    TICKET_RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
```

e dentro do `superRefine`, após a regra do InfinitePay:

```ts
if (env.TICKET_RESERVATION_PROVIDER === 'live' && env.TICKET_PROVIDER !== 'live') {
  context.addIssue({
    code: 'custom',
    path: ['TICKET_RESERVATION_PROVIDER'],
    message: 'live exige TICKET_PROVIDER=live',
  })
}
if (
  env.TICKET_RESERVATION_PROVIDER !== 'none' &&
  env.TICKET_RESERVATION_TTL_MINUTES <= env.ORDER_EXPIRATION_MINUTES
) {
  context.addIssue({
    code: 'custom',
    path: ['TICKET_RESERVATION_TTL_MINUTES'],
    message: 'deve ser maior que ORDER_EXPIRATION_MINUTES',
  })
}
```

No literal `env` de `server/domains/orders/order-service.test.ts`, após `TICKET_REGIONAL_ID: '57',`:

```ts
  TICKET_RESERVATION_PROVIDER: 'none',
  TICKET_RESERVATION_TTL_MINUTES: 30,
```

Em `.env.example`, após `TICKET_ESTABLISHMENT_ID=`:

```dotenv
# Reserva externa na coluna bilhete.reservado: none (padrão, só reserva local), mock ou live.
# live só quando a API de bilhetes publicar PUT/GET de reserva. O prazo deve ser igual
# ao configurado na API de bilhetes e maior que ORDER_EXPIRATION_MINUTES.
TICKET_RESERVATION_PROVIDER=none
TICKET_RESERVATION_TTL_MINUTES=30
```

- [x] **Passo 4: confirmar sucesso** — `npx vitest run server/config/env.test.ts server/domains/orders/order-service.test.ts`. Esperado: PASS.

- [x] **Passo 5: commit**

```bash
git add server/config/env.ts server/config/env.test.ts server/domains/orders/order-service.test.ts .env.example
git commit -m "feat: configurar provider de reserva externa de bilhetes"
```

---

### Tarefa 2: Porta de reserva e providers `none` e `mock`

**Arquivos:**

- Criar: `server/domains/tickets/ticket-reservation-gateway.ts`
- Criar: `server/domains/tickets/noop-ticket-reservation-gateway.ts`
- Criar: `server/domains/tickets/mock-ticket-reservation-gateway.ts`
- Teste: `server/domains/tickets/mock-ticket-reservation-gateway.test.ts`

**Interfaces:**

- Produz:
  - `type TicketReservationKey = { raffleId: string; ticketNumber: string }`
  - `type ReserveResult = { status: 'reserved'; token: string } | { status: 'conflict' }`
  - `type ReleaseResult = 'released' | 'not_owner'`
  - `type ReservationSnapshot = { reserved: boolean; token: string | null; validated: boolean }`
  - `interface TicketReservationGateway { reserve(key): Promise<ReserveResult>; release(key, token): Promise<ReleaseResult>; inspect(key): Promise<ReservationSnapshot | null> }`
  - `class NoopTicketReservationGateway`
  - `class MockTicketReservationGateway(ttlMs: number, now?: () => Date)` com `reserveFromAnotherChannel(key): void` para testes.

- [x] **Passo 1: teste que falha** — `server/domains/tickets/mock-ticket-reservation-gateway.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MockTicketReservationGateway } from './mock-ticket-reservation-gateway.js'

const ttlMs = 30 * 60_000
const key = { raffleId: '2026041', ticketNumber: '000123' }

describe('MockTicketReservationGateway', () => {
  it('concede a reserva a somente um de dois pedidos simultâneos', async () => {
    const gateway = new MockTicketReservationGateway(ttlMs)

    const results = await Promise.all([gateway.reserve(key), gateway.reserve(key)])

    expect(results.map(({ status }) => status).sort()).toEqual(['conflict', 'reserved'])
  })

  it('libera somente com o token de quem reservou', async () => {
    const gateway = new MockTicketReservationGateway(ttlMs)
    const result = await gateway.reserve(key)
    if (result.status !== 'reserved') throw new Error('Reserva esperada.')

    expect(await gateway.release(key, 'outro-token')).toBe('not_owner')
    expect(await gateway.release(key, result.token)).toBe('released')
    expect(await gateway.inspect(key)).toEqual({ reserved: false, token: null, validated: false })
  })

  it('permite nova reserva depois do prazo', async () => {
    let now = new Date('2026-09-27T10:00:00.000Z')
    const gateway = new MockTicketReservationGateway(ttlMs, () => now)
    await gateway.reserve(key)

    now = new Date('2026-09-27T10:31:00.000Z')

    expect((await gateway.reserve(key)).status).toBe('reserved')
  })
})
```

- [x] **Passo 2: confirmar falha** — `npx vitest run server/domains/tickets/mock-ticket-reservation-gateway.test.ts`. Esperado: FAIL (módulo inexistente).

- [x] **Passo 3: implementar**

`server/domains/tickets/ticket-reservation-gateway.ts`:

```ts
export type TicketReservationKey = {
  raffleId: string
  ticketNumber: string
}

export type ReserveResult = { status: 'reserved'; token: string } | { status: 'conflict' }

export type ReleaseResult = 'released' | 'not_owner'

export type ReservationSnapshot = {
  reserved: boolean
  token: string | null
  validated: boolean
}

// Trava remota na coluna bilhete.reservado. `token` identifica quem reservou
// (hoje, o valor de data_reservado) e é exigido para liberar.
export interface TicketReservationGateway {
  reserve(key: TicketReservationKey): Promise<ReserveResult>
  release(key: TicketReservationKey, token: string): Promise<ReleaseResult>
  inspect(key: TicketReservationKey): Promise<ReservationSnapshot | null>
}
```

`server/domains/tickets/noop-ticket-reservation-gateway.ts`:

```ts
import type {
  ReleaseResult,
  ReservationSnapshot,
  ReserveResult,
  TicketReservationGateway,
} from './ticket-reservation-gateway.js'

const LOCAL_TOKEN = 'local'

// Usado enquanto a API de bilhetes não publica reserva: vale só a reserva local.
export class NoopTicketReservationGateway implements TicketReservationGateway {
  async reserve(): Promise<ReserveResult> {
    return { status: 'reserved', token: LOCAL_TOKEN }
  }

  async release(): Promise<ReleaseResult> {
    return 'released'
  }

  async inspect(): Promise<ReservationSnapshot> {
    return { reserved: true, token: LOCAL_TOKEN, validated: false }
  }
}
```

`server/domains/tickets/mock-ticket-reservation-gateway.ts`:

```ts
import type {
  ReleaseResult,
  ReservationSnapshot,
  ReserveResult,
  TicketReservationGateway,
  TicketReservationKey,
} from './ticket-reservation-gateway.js'

type Lease = { token: string; reservedAt: number }

export class MockTicketReservationGateway implements TicketReservationGateway {
  private readonly leases = new Map<string, Lease>()
  private sequence = 0

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reserve(key: TicketReservationKey): Promise<ReserveResult> {
    const id = leaseId(key)
    const now = this.now().getTime()
    const current = this.leases.get(id)
    if (current && now - current.reservedAt < this.ttlMs) return { status: 'conflict' }
    this.sequence += 1
    const token = `${new Date(now).toISOString()}#${this.sequence}`
    this.leases.set(id, { token, reservedAt: now })
    return { status: 'reserved', token }
  }

  async release(key: TicketReservationKey, token: string): Promise<ReleaseResult> {
    const id = leaseId(key)
    if (this.leases.get(id)?.token !== token) return 'not_owner'
    this.leases.delete(id)
    return 'released'
  }

  async inspect(key: TicketReservationKey): Promise<ReservationSnapshot> {
    const lease = this.leases.get(leaseId(key))
    const active = lease !== undefined && this.now().getTime() - lease.reservedAt < this.ttlMs
    return { reserved: active, token: active ? lease.token : null, validated: false }
  }

  reserveFromAnotherChannel(key: TicketReservationKey) {
    this.leases.set(leaseId(key), { token: 'outro-canal', reservedAt: this.now().getTime() })
  }
}

function leaseId(key: TicketReservationKey) {
  return `${key.raffleId}:${key.ticketNumber}`
}
```

- [x] **Passo 4: confirmar sucesso** — mesmo comando do passo 2. Esperado: PASS.

- [x] **Passo 5: commit**

```bash
git add server/domains/tickets/ticket-reservation-gateway.ts server/domains/tickets/noop-ticket-reservation-gateway.ts server/domains/tickets/mock-ticket-reservation-gateway.ts server/domains/tickets/mock-ticket-reservation-gateway.test.ts
git commit -m "feat: porta de reserva externa de bilhetes com providers none e mock"
```

---

### Tarefa 3: Provider `live` com contrato provisório

**Arquivos:**

- Criar: `server/domains/tickets/ticket-api-fields.ts`
- Criar: `server/domains/tickets/live-ticket-reservation-gateway.ts`
- Teste: `server/domains/tickets/live-ticket-reservation-gateway.test.ts`

**Interfaces:**

- Consome: tipos da Tarefa 2; `ServerEnv` da Tarefa 1.
- Produz: `class LiveTicketReservationGateway(env: ServerEnv)`; `bitSchema` (Zod, saída `boolean`); `parseTicketApiDateTime(value: string): number` (epoch ms, `NaN` se inválido).

- [x] **Passo 1: teste que falha** — `server/domains/tickets/live-ticket-reservation-gateway.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseServerEnv } from '../../config/env.js'
import { LiveTicketReservationGateway } from './live-ticket-reservation-gateway.js'

const env = parseServerEnv({
  TICKET_PROVIDER: 'live',
  TICKET_RESERVATION_PROVIDER: 'live',
  TICKET_API_BASE_URL: 'https://bilhetes.example',
})
const key = { raffleId: '2026041', ticketNumber: '000123' }

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status })
}

function requestAt(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  const call = fetchMock.mock.calls.at(index)
  if (!call) throw new Error('A API de bilhetes não foi chamada.')
  const init: RequestInit = call[1]
  return {
    url: String(call[0]),
    method: init.method,
    body: JSON.parse(String(init.body ?? 'null')),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LiveTicketReservationGateway', () => {
  it('reserva com PUT reservado=true e usa data_reservado como token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(reply(200, { success: true, data_reservado: '2026-09-27 10:00:00' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new LiveTicketReservationGateway(env).reserve(key)).resolves.toEqual({
      status: 'reserved',
      token: '2026-09-27 10:00:00',
    })
    expect(requestAt(fetchMock, 0)).toEqual({
      url: 'https://bilhetes.example/bilhete/reservado',
      method: 'PUT',
      body: { numero: '000123', concurso_id: 2026041, estabelecimento_id: 4734, reservado: true },
    })
  })

  it('traduz 409 da reserva em conflito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(409, { success: false })))

    await expect(new LiveTicketReservationGateway(env).reserve(key)).resolves.toEqual({
      status: 'conflict',
    })
  })

  it('libera enviando o token e reconhece perda de posse', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(200, { success: true }))
      .mockResolvedValueOnce(reply(409, { success: false }))
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new LiveTicketReservationGateway(env)

    expect(await gateway.release(key, '2026-09-27 10:00:00')).toBe('released')
    expect(await gateway.release(key, '2026-09-27 10:00:00')).toBe('not_owner')
    expect(requestAt(fetchMock, 0).body).toEqual({
      numero: '000123',
      concurso_id: 2026041,
      estabelecimento_id: 4734,
      reservado: false,
      data_reservado: '2026-09-27 10:00:00',
    })
  })

  it('lê reservado, data_reservado e validado vindos de colunas BIT', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply(200, {
        success: true,
        reservado: 1,
        data_reservado: '2026-09-27 10:00:00',
        validado: 0,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(new LiveTicketReservationGateway(env).inspect(key)).resolves.toEqual({
      reserved: true,
      token: '2026-09-27 10:00:00',
      validated: false,
    })
    const url = new URL(requestAt(fetchMock, 0).url)
    expect(url.pathname).toBe('/bilhete/reservado')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      concurso_id: '2026041',
      numero: '000123',
      estabelecimento_id: '4734',
    })
  })

  it('devolve null para bilhete inexistente e esconde falhas da API', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(reply(404, { success: false }))
        .mockResolvedValueOnce(reply(500, { error: 'SQLSTATE[HY000]' })),
    )
    const gateway = new LiveTicketReservationGateway(env)

    await expect(gateway.inspect(key)).resolves.toBeNull()
    await expect(gateway.reserve(key)).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    })
  })
})
```

- [x] **Passo 2: confirmar falha** — `npx vitest run server/domains/tickets/live-ticket-reservation-gateway.test.ts`. Esperado: FAIL (módulo inexistente).

- [x] **Passo 3: implementar**

`server/domains/tickets/ticket-api-fields.ts`:

```ts
import { z } from 'zod'

// Colunas BIT(1) chegam como boolean, 0/1 ou null conforme o driver da API de bilhetes.
export const bitSchema = z
  .union([z.boolean(), z.literal(0), z.literal(1), z.null()])
  .transform((value) => value === true || value === 1)

// DATETIME da API de bilhetes vem sem fuso, no horário de America/Fortaleza.
export function parseTicketApiDateTime(value: string): number {
  return Date.parse(`${value.replace(' ', 'T')}-03:00`)
}
```

`server/domains/tickets/live-ticket-reservation-gateway.ts`:

```ts
import { z } from 'zod'
import type { ServerEnv } from '../../config/env.js'
import { DomainError } from '../../shared/errors.js'
import { bitSchema } from './ticket-api-fields.js'
import type {
  ReleaseResult,
  ReservationSnapshot,
  ReserveResult,
  TicketReservationGateway,
  TicketReservationKey,
} from './ticket-reservation-gateway.js'

// Contrato provisório: a API de bilhetes ainda não publicou estes endpoints.
// Ajuste caminho e campos somente aqui quando o contrato oficial existir.
const RESERVATION_PATH = '/bilhete/reservado'

const reserveResponseSchema = z.object({
  success: z.literal(true),
  data_reservado: z.string().min(1),
})

const releaseResponseSchema = z.object({ success: z.literal(true) }).passthrough()

const inspectResponseSchema = z.object({
  success: z.literal(true),
  reservado: bitSchema,
  data_reservado: z.string().min(1).nullable(),
  validado: bitSchema,
})

type UpstreamResponse = { status: number; body: unknown }

export class LiveTicketReservationGateway implements TicketReservationGateway {
  constructor(private readonly env: ServerEnv) {}

  async reserve(key: TicketReservationKey): Promise<ReserveResult> {
    const response = await this.request('PUT', RESERVATION_PATH, {
      ...this.identify(key),
      reservado: true,
    })
    if (response.status === 409) return { status: 'conflict' }
    const body = parseSuccess(reserveResponseSchema, response)
    return { status: 'reserved', token: body.data_reservado }
  }

  async release(key: TicketReservationKey, token: string): Promise<ReleaseResult> {
    const response = await this.request('PUT', RESERVATION_PATH, {
      ...this.identify(key),
      reservado: false,
      data_reservado: token,
    })
    if (response.status === 409) return 'not_owner'
    parseSuccess(releaseResponseSchema, response)
    return 'released'
  }

  async inspect(key: TicketReservationKey): Promise<ReservationSnapshot | null> {
    const query = new URLSearchParams({
      concurso_id: key.raffleId,
      numero: key.ticketNumber,
      estabelecimento_id: this.env.TICKET_ESTABLISHMENT_ID,
    })
    const response = await this.request('GET', `${RESERVATION_PATH}?${query.toString()}`)
    if (response.status === 404) return null
    const body = parseSuccess(inspectResponseSchema, response)
    return { reserved: body.reservado, token: body.data_reservado, validated: body.validado }
  }

  private identify(key: TicketReservationKey) {
    return {
      numero: key.ticketNumber,
      concurso_id: Number(key.raffleId),
      estabelecimento_id: Number(this.env.TICKET_ESTABLISHMENT_ID),
    }
  }

  private async request(
    method: 'GET' | 'PUT',
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<UpstreamResponse> {
    const response = await fetch(`${this.env.TICKET_API_BASE_URL}${path}`, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      throw upstreamError()
    })
    const body: unknown = await response.json().catch(() => null)
    return { status: response.status, body }
  }
}

function parseSuccess<T>(schema: z.ZodType<T>, response: UpstreamResponse): T {
  if (response.status < 200 || response.status >= 300) throw upstreamError()
  const parsed = schema.safeParse(response.body)
  if (!parsed.success) {
    throw new DomainError(
      'Serviço externo respondeu fora do contrato esperado.',
      502,
      'UPSTREAM_SCHEMA',
    )
  }
  return parsed.data
}

function upstreamError() {
  return new DomainError('Serviço externo indisponível.', 502, 'UPSTREAM_ERROR')
}
```

- [x] **Passo 4: confirmar sucesso** — mesmo comando do passo 2. Esperado: PASS.

- [x] **Passo 5: commit**

```bash
git add server/domains/tickets/ticket-api-fields.ts server/domains/tickets/live-ticket-reservation-gateway.ts server/domains/tickets/live-ticket-reservation-gateway.test.ts
git commit -m "feat: provider live de reserva de bilhetes com contrato provisório"
```

---

### Tarefa 4: Persistência das travas remotas (schema v4)

**Arquivos:**

- Modificar: `server/shared/database-migrations.ts`
- Criar: `server/domains/orders/remote-reservation-repository.ts`
- Modificar: `server/domains/orders/order-repository.ts` (novo `cancel`; `expirePending` passa a público)
- Teste: `server/shared/database.test.ts`

**Interfaces:**

- Consome: `TicketReservationKey` (Tarefa 2).
- Produz:
  - `type HeldReservation = { orderId: string; key: TicketReservationKey; token: string }`
  - `RemoteReservationRepository(database, now)` com `recordHeld(orderId, key, token)`, `listHeld(orderId): HeldReservation[]`, `hasAny(orderId): boolean`, `listAbandoned(limit): HeldReservation[]`, `mark(reservation, status: 'released' | 'lost')`, `markReleaseFailed(reservation, message)`, `markOrderValidated(orderId)`.
  - `OrderRepository.cancel(orderId): void` e `OrderRepository.expirePending(): void`.

- [x] **Passo 1: testes que falham** — em `server/shared/database.test.ts`:
  - trocar as asserções `user_version: 3` por `user_version: 4` e o título `'creates an empty database at schema version 3'` por `'... version 4'`;
  - importar `RemoteReservationRepository` de `'../domains/orders/remote-reservation-repository.js'`;
  - acrescentar:

```ts
describe('RemoteReservationRepository', () => {
  const key = (ticketNumber: string) => ({ raffleId: 'sorteio-setembro', ticketNumber })

  it('cria a tabela de reservas externas', () => {
    const database = createDatabase(':memory:')

    expect(database.prepare('PRAGMA table_info(remote_reservations)').all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'token' }),
        expect.objectContaining({ name: 'status' }),
        expect.objectContaining({ name: 'last_error' }),
      ]),
    )
    database.close()
  })

  it('lista para liberação somente reservas externas de pedidos cancelados ou expirados', () => {
    const database = createDatabase(':memory:')
    const orders = new OrderRepository(database, reservationTime)
    const remote = new RemoteReservationRepository(database, reservationTime)
    const active = order({ items: [ticket('card-001')] })
    const cancelled = order({
      id: '00000000-0000-4000-8000-000000000002',
      items: [ticket('card-002')],
    })
    orders.createManual(active)
    orders.createManual(cancelled)
    remote.recordHeld(active.id, key('card-001'), 't1')
    remote.recordHeld(cancelled.id, key('card-002'), 't2')

    orders.cancel(cancelled.id)

    expect(remote.listAbandoned(10)).toEqual([
      { orderId: cancelled.id, key: key('card-002'), token: 't2' },
    ])
    expect(orders.isReserved('sorteio-setembro:card-002')).toBe(false)
    expect(orders.get(cancelled.id)?.status).toBe('cancelled')
    database.close()
  })

  it('marca como validadas as reservas externas do pedido pago', () => {
    const database = createDatabase(':memory:')
    const orders = new OrderRepository(database, reservationTime)
    const remote = new RemoteReservationRepository(database, reservationTime)
    const paid = order({ items: [ticket('card-003')] })
    orders.createManual(paid)
    remote.recordHeld(paid.id, key('card-003'), 't3')

    remote.markOrderValidated(paid.id)

    expect(remote.listHeld(paid.id)).toEqual([])
    expect(remote.hasAny(paid.id)).toBe(true)
    database.close()
  })
})
```

- [x] **Passo 2: confirmar falha** — `npx vitest run server/shared/database.test.ts`. Esperado: FAIL (`user_version` 3 e módulo inexistente).

- [x] **Passo 3: implementar**

Em `server/shared/database-migrations.ts`:

- `const CURRENT_SCHEMA_VERSION = 4`
- no ramo de migração: `if (version < 4) migrateToVersion4(database)` após a linha da versão 3;
- ao fim de `createLatestSchema`: `database.exec(REMOTE_RESERVATIONS_SCHEMA)`;
- acrescentar:

```ts
const REMOTE_RESERVATIONS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS remote_reservations (
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    raffle_id TEXT NOT NULL,
    ticket_number TEXT NOT NULL,
    token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'held',
    last_error TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (order_id, raffle_id, ticket_number)
  );

  CREATE INDEX IF NOT EXISTS idx_remote_reservations_status
    ON remote_reservations(status, updated_at);
`

function migrateToVersion4(database: DatabaseSync) {
  database.exec(REMOTE_RESERVATIONS_SCHEMA)
}
```

`server/domains/orders/remote-reservation-repository.ts`:

```ts
import { z } from 'zod'
import type { AppDatabase } from '../../shared/database.js'
import type { TicketReservationKey } from '../tickets/ticket-reservation-gateway.js'

export type HeldReservation = {
  orderId: string
  key: TicketReservationKey
  token: string
}

const heldRowsSchema = z.array(
  z
    .object({
      order_id: z.string(),
      raffle_id: z.string(),
      ticket_number: z.string(),
      token: z.string(),
    })
    .transform((row): HeldReservation => ({
      orderId: row.order_id,
      key: { raffleId: row.raffle_id, ticketNumber: row.ticket_number },
      token: row.token,
    })),
)

// held: trava remota ativa; released/lost: trava liberada ou tomada por outro canal;
// validated: bilhete validado após pagamento confirmado.
export class RemoteReservationRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly now: () => Date,
  ) {}

  recordHeld(orderId: string, key: TicketReservationKey, token: string) {
    this.database
      .prepare(
        `
        INSERT INTO remote_reservations (
          order_id, raffle_id, ticket_number, token, status, updated_at
        ) VALUES (?, ?, ?, ?, 'held', ?)
      `,
      )
      .run(orderId, key.raffleId, key.ticketNumber, token, this.now().toISOString())
  }

  listHeld(orderId: string) {
    return heldRowsSchema.parse(
      this.database
        .prepare(
          `
          SELECT order_id, raffle_id, ticket_number, token FROM remote_reservations
          WHERE order_id = ? AND status = 'held' ORDER BY raffle_id, ticket_number
        `,
        )
        .all(orderId),
    )
  }

  hasAny(orderId: string) {
    return (
      this.database
        .prepare('SELECT 1 FROM remote_reservations WHERE order_id = ? LIMIT 1')
        .get(orderId) !== undefined
    )
  }

  listAbandoned(limit: number) {
    return heldRowsSchema.parse(
      this.database
        .prepare(
          `
          SELECT r.order_id, r.raffle_id, r.ticket_number, r.token
          FROM remote_reservations r JOIN orders o ON o.id = r.order_id
          WHERE r.status = 'held' AND o.status IN ('expired', 'cancelled')
          ORDER BY r.updated_at LIMIT ?
        `,
        )
        .all(limit),
    )
  }

  mark(reservation: HeldReservation, status: 'released' | 'lost') {
    this.database
      .prepare(
        `
        UPDATE remote_reservations SET status = ?, last_error = NULL, updated_at = ?
        WHERE order_id = ? AND raffle_id = ? AND ticket_number = ? AND status = 'held'
      `,
      )
      .run(
        status,
        this.now().toISOString(),
        reservation.orderId,
        reservation.key.raffleId,
        reservation.key.ticketNumber,
      )
  }

  markReleaseFailed(reservation: HeldReservation, message: string) {
    this.database
      .prepare(
        `
        UPDATE remote_reservations SET last_error = ?, updated_at = ?
        WHERE order_id = ? AND raffle_id = ? AND ticket_number = ?
      `,
      )
      .run(
        message.slice(0, 500),
        this.now().toISOString(),
        reservation.orderId,
        reservation.key.raffleId,
        reservation.key.ticketNumber,
      )
  }

  markOrderValidated(orderId: string) {
    this.database
      .prepare(
        `
        UPDATE remote_reservations SET status = 'validated', updated_at = ?
        WHERE order_id = ? AND status = 'held'
      `,
      )
      .run(this.now().toISOString(), orderId)
  }
}
```

Em `server/domains/orders/order-repository.ts`, após `markManualReview`:

```ts
  cancel(orderId: string) {
    this.withReservationTransaction(() => {
      const result = this.database
        .prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'")
        .run(orderId)
      if (result.changes === 1) {
        this.database.prepare('DELETE FROM reservations WHERE order_id = ?').run(orderId)
      }
    })
  }
```

e trocar `private expirePending()` por `expirePending()`.

- [x] **Passo 4: confirmar sucesso** — `npx vitest run server/shared/database.test.ts`. Esperado: PASS.

- [x] **Passo 5: commit**

```bash
git add server/shared/database-migrations.ts server/shared/database.test.ts server/domains/orders/remote-reservation-repository.ts server/domains/orders/order-repository.ts
git commit -m "feat: persistir reservas externas de bilhetes (schema v4)"
```

---

### Tarefa 5: Coordenador de reservas

**Arquivos:**

- Criar: `server/domains/orders/ticket-reservation-coordinator.ts`
- Teste: `server/domains/orders/ticket-reservation-coordinator.test.ts`

**Interfaces:**

- Consome: `TicketReservationGateway` (Tarefa 2), `RemoteReservationRepository`/`HeldReservation` (Tarefa 4), `Order`.
- Produz: `TicketReservationCoordinator(gateway, store)` com
  - `acquire(order: Order): Promise<'acquired' | 'conflict'>` — compensa sozinho em conflito; em erro, compensa e relança;
  - `confirmOwnership(order: Order): Promise<boolean>`;
  - `markValidated(orderId: string): void`;
  - `releaseOrder(orderId: string): Promise<void>`;
  - `releaseAbandoned(limit?: number): Promise<number>`.

- [x] **Passo 1: teste que falha** — `server/domains/orders/ticket-reservation-coordinator.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createDatabase } from '../../shared/database.js'
import { DomainError } from '../../shared/errors.js'
import { MockTicketReservationGateway } from '../tickets/mock-ticket-reservation-gateway.js'
import { OrderRepository } from './order-repository.js'
import { order, ticket } from './order-test-fixtures.js'
import { RemoteReservationRepository } from './remote-reservation-repository.js'
import { TicketReservationCoordinator } from './ticket-reservation-coordinator.js'

const now = () => new Date('2026-09-23T10:00:00.000Z')
const key = (ticketNumber: string) => ({ raffleId: 'sorteio-setembro', ticketNumber })

function setup() {
  const database = createDatabase(':memory:')
  const orders = new OrderRepository(database, now)
  const store = new RemoteReservationRepository(database, now)
  const gateway = new MockTicketReservationGateway(30 * 60_000, now)
  const coordinator = new TicketReservationCoordinator(gateway, store)
  const pending = order({ items: [ticket('card-002'), ticket('card-001')] })
  orders.createManual(pending)
  return { database, orders, store, gateway, coordinator, pending }
}

describe('TicketReservationCoordinator', () => {
  it('reserva remotamente todas os bilhetes em ordem estável', async () => {
    const { database, store, coordinator, pending } = setup()

    expect(await coordinator.acquire(pending)).toBe('acquired')

    expect(store.listHeld(pending.id).map(({ key: held }) => held.ticketNumber)).toEqual([
      'card-001',
      'card-002',
    ])
    database.close()
  })

  it('desfaz a reserva parcial quando outro canal já reservou um bilhete', async () => {
    const { database, store, gateway, coordinator, pending } = setup()
    gateway.reserveFromAnotherChannel(key('card-002'))

    expect(await coordinator.acquire(pending)).toBe('conflict')

    expect(await gateway.inspect(key('card-001'))).toMatchObject({ reserved: false })
    expect(store.listHeld(pending.id)).toEqual([])
    database.close()
  })

  it('desfaz a reserva parcial e relança quando a API falha', async () => {
    const { database, store, gateway, coordinator, pending } = setup()
    const original = gateway.reserve.bind(gateway)
    vi.spyOn(gateway, 'reserve')
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(
        new DomainError('Serviço externo indisponível.', 502, 'UPSTREAM_ERROR'),
      )

    await expect(coordinator.acquire(pending)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' })

    expect(await gateway.inspect(key('card-001'))).toMatchObject({ reserved: false })
    expect(store.listHeld(pending.id)).toEqual([])
    database.close()
  })

  it('só confirma posse com o mesmo token em todas os bilhetes', async () => {
    const { database, gateway, coordinator, pending } = setup()
    await coordinator.acquire(pending)
    expect(await coordinator.confirmOwnership(pending)).toBe(true)

    gateway.reserveFromAnotherChannel(key('card-002'))

    expect(await coordinator.confirmOwnership(pending)).toBe(false)
    database.close()
  })

  it('mantém o fluxo atual para pedido criado antes da reserva externa', async () => {
    const { database, coordinator, pending } = setup()

    expect(await coordinator.confirmOwnership(pending)).toBe(true)
    database.close()
  })

  it('libera reservas de pedido cancelado e registra falha para nova tentativa', async () => {
    const { database, orders, store, gateway, coordinator, pending } = setup()
    await coordinator.acquire(pending)
    orders.cancel(pending.id)
    vi.spyOn(gateway, 'release').mockRejectedValueOnce(new Error('timeout'))

    expect(await coordinator.releaseAbandoned()).toBe(2)

    expect(store.listAbandoned(10)).toHaveLength(1)
    expect(
      database
        .prepare('SELECT last_error FROM remote_reservations WHERE last_error IS NOT NULL')
        .get(),
    ).toEqual({ last_error: 'timeout' })
    await coordinator.releaseAbandoned()
    expect(store.listAbandoned(10)).toEqual([])
    database.close()
  })
})
```

- [x] **Passo 2: confirmar falha** — `npx vitest run server/domains/orders/ticket-reservation-coordinator.test.ts`. Esperado: FAIL (módulo inexistente).

- [x] **Passo 3: implementar** — `server/domains/orders/ticket-reservation-coordinator.ts`:

```ts
import type {
  TicketReservationGateway,
  TicketReservationKey,
} from '../tickets/ticket-reservation-gateway.js'
import type { Order } from './order-types.js'
import type {
  HeldReservation,
  RemoteReservationRepository,
} from './remote-reservation-repository.js'

export class TicketReservationCoordinator {
  constructor(
    private readonly gateway: TicketReservationGateway,
    private readonly store: RemoteReservationRepository,
  ) {}

  async acquire(order: Order): Promise<'acquired' | 'conflict'> {
    for (const key of reservationKeys(order)) {
      const result = await this.gateway.reserve(key).catch(async (error: unknown) => {
        await this.releaseOrder(order.id)
        throw error
      })
      if (result.status === 'conflict') {
        await this.releaseOrder(order.id)
        return 'conflict'
      }
      this.store.recordHeld(order.id, key, result.token)
    }
    return 'acquired'
  }

  async confirmOwnership(order: Order) {
    const held = this.store.listHeld(order.id)
    // Pedido criado antes da reserva externa: segue o fluxo anterior.
    if (held.length === 0 && !this.store.hasAny(order.id)) return true
    if (held.length !== order.items.length) return false
    for (const reservation of held) {
      const snapshot = await this.gateway.inspect(reservation.key)
      if (!snapshot?.reserved || snapshot.validated || snapshot.token !== reservation.token) {
        return false
      }
    }
    return true
  }

  markValidated(orderId: string) {
    this.store.markOrderValidated(orderId)
  }

  async releaseOrder(orderId: string) {
    for (const reservation of this.store.listHeld(orderId)) await this.release(reservation)
  }

  async releaseAbandoned(limit = 20) {
    const abandoned = this.store.listAbandoned(limit)
    for (const reservation of abandoned) await this.release(reservation)
    return abandoned.length
  }

  // Falha mantém a trava como held para o worker tentar de novo; o prazo externo
  // libera o bilhete mesmo que todas as tentativas falhem.
  private async release(reservation: HeldReservation) {
    try {
      const result = await this.gateway.release(reservation.key, reservation.token)
      this.store.mark(reservation, result === 'released' ? 'released' : 'lost')
    } catch (error) {
      this.store.markReleaseFailed(
        reservation,
        error instanceof Error ? error.message : 'Falha ao liberar reserva externa.',
      )
    }
  }
}

function reservationKeys(order: Order): TicketReservationKey[] {
  return order.items
    .map((item) => ({ raffleId: item.raffleId ?? order.raffleId, ticketNumber: item.id }))
    .sort(
      (left, right) =>
        left.raffleId.localeCompare(right.raffleId) ||
        left.ticketNumber.localeCompare(right.ticketNumber),
    )
}
```

- [x] **Passo 4: confirmar sucesso** — mesmo comando do passo 2. Esperado: PASS.

- [x] **Passo 5: commit**

```bash
git add server/domains/orders/ticket-reservation-coordinator.ts server/domains/orders/ticket-reservation-coordinator.test.ts
git commit -m "feat: coordenar reserva externa, compensação e liberação de bilhetes"
```

---

### Tarefa 6: Integrar ao pedido, à confirmação de pagamento e ao worker

**Arquivos:**

- Modificar: `server/domains/orders/order-service.ts`
- Modificar: `server/app.ts`
- Teste: `server/domains/orders/order-service.test.ts`

**Interfaces:**

- Consome: `TicketReservationCoordinator` (Tarefa 5), providers (Tarefas 2–3), `OrderRepository.cancel`/`expirePending` (Tarefa 4).
- Produz: `new OrderService(repository, tickets, payments, customers, reservations, env, now)`; `OrderService.releaseAbandonedReservations(): Promise<number>`; `AppOptions.reservations?: TicketReservationGateway`.

- [x] **Passo 1: testes que falham** — em `server/domains/orders/order-service.test.ts`:
  - novos imports:

```ts
import { createDatabase } from '../../shared/database.js'
import { CustomerService } from '../customers/customer-service.js'
import { MockTicketReservationGateway } from '../tickets/mock-ticket-reservation-gateway.js'
import type { TicketReservationGateway } from '../tickets/ticket-reservation-gateway.js'
import { OrderRepository } from './order-repository.js'
import { OrderService } from './order-service.js'
import { RemoteReservationRepository } from './remote-reservation-repository.js'
import { TicketReservationCoordinator } from './ticket-reservation-coordinator.js'
```

- `createPaymentHarness` ganha terceiro parâmetro `reservations?: TicketReservationGateway`, repassado ao `buildApp({ ..., reservations })`;
- novo bloco:

```ts
describe('reserva externa do bilhete', () => {
  const ttlMs = 30 * 60_000
  const key = (ticketNumber: string) => ({ raffleId: 'sorteio-setembro', ticketNumber })

  it('recusa bilhete reservado por outro canal e desfaz as demais reservas', async () => {
    const reservations = new MockTicketReservationGateway(ttlMs)
    reservations.reserveFromAnotherChannel(key('card-041'))
    const app = await buildApp({ env, reservations, logger: false, startWorker: false })
    apps.push(app)

    const conflict = await createOrder(app, { mode: 'manual', cardIds: ['card-040', 'card-041'] })

    expect(conflict.statusCode).toBe(409)
    expect(conflict.json()).toMatchObject({ code: 'TICKET_RESERVED' })
    expect(await reservations.inspect(key('card-040'))).toMatchObject({ reserved: false })
    const retry = await createOrder(app, { mode: 'manual', cardIds: ['card-040'] })
    expect(retry.statusCode).toBe(201)
  })

  it('não valida o bilhete quando a reserva externa foi perdida antes do pagamento', async () => {
    const reservations = new MockTicketReservationGateway(ttlMs)
    const harness = await createPaymentHarness(undefined, undefined, reservations)
    reservations.reserveFromAnotherChannel(key('card-020'))

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/orders/${harness.orderId}?transaction_nsu=mock-${harness.orderId}&slug=mock-${harness.orderId}`,
    })

    expect(response.json()).toMatchObject({ status: 'manual_review' })
    expect(harness.fulfillOrder).not.toHaveBeenCalled()
  })

  it('valida o bilhete quando o pedido mantém a reserva externa', async () => {
    const reservations = new MockTicketReservationGateway(ttlMs)
    const harness = await createPaymentHarness(undefined, undefined, reservations)

    const paid = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/orders/${harness.orderId}?transaction_nsu=mock-${harness.orderId}&slug=mock-${harness.orderId}`,
    })

    expect(paid.json()).toMatchObject({ status: 'paid' })
    expect(harness.fulfillOrder).toHaveBeenCalledTimes(1)
  })

  it('libera a reserva externa quando o pedido expira', async () => {
    let currentTime = new Date('2026-09-23T10:00:00.000Z')
    const now = () => currentTime
    const database = createDatabase(':memory:')
    const gateway = new MockTicketReservationGateway(ttlMs, now)
    const service = new OrderService(
      new OrderRepository(database, now),
      new MockTicketGateway(),
      new MockPaymentGateway(env),
      new CustomerService(new MockCustomerGateway()),
      new TicketReservationCoordinator(gateway, new RemoteReservationRepository(database, now)),
      env,
      now,
    )
    await service.createOrder({
      raffleId: 'sorteio-setembro',
      selection: { mode: 'manual', cardIds: ['card-045'] },
      customer: existingCustomer,
    })
    expect(await gateway.inspect(key('card-045'))).toMatchObject({ reserved: true })

    currentTime = new Date('2026-09-23T10:16:00.000Z')
    await service.releaseAbandonedReservations()

    expect(await gateway.inspect(key('card-045'))).toMatchObject({ reserved: false })
    database.close()
  })
})
```

Observação: os testes de pagamento usam o redirect (`?transaction_nsu=&slug=`) para reconciliar sem worker, como o primeiro teste do arquivo. Se `existingCustomer` não satisfizer o tipo de `CreateOrderInput`, declare-o com `satisfies CreateOrderInput['customer']`.

- [x] **Passo 2: confirmar falha** — `npx vitest run server/domains/orders/order-service.test.ts`. Esperado: FAIL (opção `reservations` ignorada e construtor com aridade diferente).

- [x] **Passo 3: implementar**

`server/domains/orders/order-service.ts`:

- importar `TicketReservationCoordinator` de `'./ticket-reservation-coordinator.js'`;
- construtor: inserir `private readonly reservations: TicketReservationCoordinator,` logo após `customers`;
- em `createOrder`, trocar os dois retornos:

```ts
return this.holdRemotely(this.repository.createRandom(draft, candidates, input.selection.quantity))
```

```ts
return this.holdRemotely(this.repository.createManual(order))
```

- em `createGroupedOrder`, trocar o retorno por `return this.holdRemotely(this.repository.createGrouped(draft, groups))`;
- acrescentar após `createGroupedOrder`:

```ts
  private async holdRemotely(order: Order) {
    const outcome = await this.reservations.acquire(order).catch((error: unknown) => {
      this.repository.cancel(order.id)
      throw error
    })
    if (outcome === 'conflict') {
      this.repository.cancel(order.id)
      throw new DomainError('Um ou mais bilhetes já estão reservados.', 409, 'TICKET_RESERVED')
    }
    return order
  }

  async releaseAbandonedReservations() {
    this.repository.expirePending()
    return this.reservations.releaseAbandoned()
  }
```

- em `reconcile`, o bloco `try` final passa a ser:

```ts
    try {
      if (!(await this.reservations.confirmOwnership(order))) {
        this.repository.markManualReview(
          order.id,
          'Reserva externa do bilhete foi perdida antes da validacao.',
        )
        return
      }
      await this.customers.ensureRegistered(order.customer)
      await this.tickets.fulfillOrder({ ...order, status: 'processing' })
      this.repository.markPaid(order.id)
      this.reservations.markValidated(order.id)
    } catch (error) {
```

`server/app.ts`:

- imports: `LiveTicketReservationGateway`, `MockTicketReservationGateway`, `NoopTicketReservationGateway`, `type TicketReservationGateway`, `RemoteReservationRepository`, `TicketReservationCoordinator`;
- `AppOptions` ganha `reservations?: TicketReservationGateway`;
- mover `const now = options.now ?? (() => new Date())` para logo após `createDatabase`;
- após `customers`:

```ts
const reservationGateway =
  options.reservations ??
  (env.TICKET_RESERVATION_PROVIDER === 'live'
    ? new LiveTicketReservationGateway(env)
    : env.TICKET_RESERVATION_PROVIDER === 'mock'
      ? new MockTicketReservationGateway(env.TICKET_RESERVATION_TTL_MINUTES * 60_000, now)
      : new NoopTicketReservationGateway())
```

- construção do serviço:

```ts
const service = new OrderService(
  new OrderRepository(database, now),
  tickets,
  payments,
  customers,
  new TicketReservationCoordinator(
    reservationGateway,
    new RemoteReservationRepository(database, now),
  ),
  env,
  now,
)
```

- worker:

```ts
worker = setInterval(() => {
  void service.processNextPaymentEvent().catch((error: unknown) => app.log.error(error))
  void service.releaseAbandonedReservations().catch((error: unknown) => app.log.error(error))
}, 5_000)
```

- [x] **Passo 4: confirmar sucesso** — `npx vitest run server`. Esperado: PASS em todos, incluindo os testes antigos de pedido (provider `none`).

- [x] **Passo 5: commit**

```bash
git add server/domains/orders/order-service.ts server/domains/orders/order-service.test.ts server/app.ts
git commit -m "feat: travar bilhete na API externa ao criar pedido e conferir posse antes de validar"
```

---

### Tarefa 7: Listagem ignora bilhetes reservados ou validadas

**Arquivos:**

- Modificar: `server/domains/tickets/live-ticket-gateway.ts`
- Teste: `server/domains/tickets/live-ticket-gateway.test.ts`

**Interfaces:**

- Consome: `bitSchema`, `parseTicketApiDateTime` (Tarefa 3); `TICKET_RESERVATION_TTL_MINUTES` (Tarefa 1).
- Produz: sem mudança de assinatura; `getAvailableTickets`/`getAvailableTicket` passam a omitir bilhetes indisponíveis.

- [x] **Passo 1: teste que falha** — acrescentar ao `describe('LiveTicketGateway')`:

```ts
it('omite bilhetes validados ou com reserva externa dentro do prazo', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              ...externalTicket,
              numero: '000001',
              reservado: 1,
              data_reservado: '2026-09-27 09:50:00',
              validado: 0,
            },
            {
              ...externalTicket,
              numero: '000002',
              reservado: 1,
              data_reservado: '2026-09-27 09:00:00',
              validado: 0,
            },
            {
              ...externalTicket,
              numero: '000003',
              reservado: 0,
              data_reservado: null,
              validado: 1,
            },
            { ...externalTicket, numero: '000004' },
          ],
        }),
      ),
    ),
  )
  // 10:00 em America/Fortaleza; prazo padrão de 30 minutos.
  const gateway = new LiveTicketGateway(liveEnv, () => new Date('2026-09-27T13:00:00.000Z'))

  const tickets = await gateway.getAvailableTickets('2026041')

  expect(tickets.map(({ id }) => id)).toEqual(['000002', '000004'])
})
```

- [x] **Passo 2: confirmar falha** — `npx vitest run server/domains/tickets/live-ticket-gateway.test.ts`. Esperado: FAIL (retorna as 4 bilhetes).

- [x] **Passo 3: implementar** — em `server/domains/tickets/live-ticket-gateway.ts`:
- importar `{ bitSchema, parseTicketApiDateTime }` de `'./ticket-api-fields.js'`;
- no `z.object` de `externalTicketSchema`, após `dezenas`:

```ts
    reservado: bitSchema.optional(),
    data_reservado: z.string().nullable().optional(),
    validado: bitSchema.optional(),
```

- `getAvailableTickets`: `return response.data.filter((ticket) => this.isOffered(ticket)).map(mapTicket)`;
- `getAvailableTicket`, ramo `bilhete`: `return parsed.data.disponivel && this.isOffered(parsed.data.bilhete) ? mapTicket(parsed.data.bilhete) : null`; ramo `data`: `return this.isOffered(ticket) ? mapTicket(ticket) : null`;
- novo método privado:

```ts
  private isOffered(ticket: z.output<typeof externalTicketSchema>) {
    if (ticket.validado) return false
    if (!ticket.reservado) return true
    if (!ticket.data_reservado) return false
    const reservedFor = this.now().getTime() - parseTicketApiDateTime(ticket.data_reservado)
    return reservedFor >= this.env.TICKET_RESERVATION_TTL_MINUTES * 60_000
  }
```

Data inválida gera `NaN`, a comparação falha e o bilhete fica oculta (lado seguro).

- [x] **Passo 4: confirmar sucesso** — mesmo comando do passo 2. Esperado: PASS, inclusive os testes antigos (campos ausentes não filtram nada).

- [x] **Passo 5: commit**

```bash
git add server/domains/tickets/live-ticket-gateway.ts server/domains/tickets/live-ticket-gateway.test.ts
git commit -m "feat: ocultar bilhetes reservados ou validadas na listagem live"
```

---

### Tarefa 8: Documentação e verificação final

**Arquivos:**

- Criar: `docs/design-docs/2026-09-27-concorrencia-reserva-bilhete.md`
- Modificar: `docs/API_CONTRACTS.md`, `docs/BACKEND.md`, `docs/exec-plans/tech-debt-tracker.md`, este plano (Progresso/Validação)

- [x] **Passo 1: design doc** — status "aceito"; copiar as seções "Técnica de concorrência" e "Decisões" deste plano, em forma resumida (decisão, motivo, alternativas descartadas, contrato pedido à API de bilhetes com os SQL).

- [x] **Passo 2: `docs/API_CONTRACTS.md`**
  - em "Escrita", acrescentar: "`PUT /bilhete/reservado` e `GET /bilhete/reservado` — **provisório, ainda não publicado**. Reserva com `reservado: true`; libera com `reservado: false` e `data_reservado` (token). `409` indica bilhete já reservada/validada ou token que não é o dono. Contrato detalhado em `docs/design-docs/2026-09-27-concorrencia-reserva-bilhete.md`.";
  - em "Leitura", registrar que `reservado`, `data_reservado` e `validado` são opcionais na listagem e, quando presentes, ocultam o bilhete;
  - em "Limitações conhecidas", trocar "A API externa não oferece reserva com expiração..." por "Reserva externa implementada no backend e desligada (`TICKET_RESERVATION_PROVIDER=none`) até a API de bilhetes publicar os endpoints."

- [x] **Passo 3: `docs/BACKEND.md`**
  - no "Fluxo de pagamento", passo 2: "Persiste pedido e reservas com unicidade no SQLite e trava cada bilhete na API de bilhetes (`reservado`), desfazendo tudo em conflito.";
  - passo 6: "Confere que a trava externa ainda pertence ao pedido; depois cadastra/consulta pessoa e valida cada bilhete (`validado`).";
  - reescrever "Limitação da API externa": enquanto o provider for `none`, outro canal ainda pode vender o bilhete entre seleção e pagamento (pedido pago vai para revisão manual); com `live`, a trava condicional em `reservado` elimina esse risco dentro do prazo `TICKET_RESERVATION_TTL_MINUTES`.

- [x] **Passo 4: dívida técnica** — em `docs/exec-plans/tech-debt-tracker.md`, substituir a linha "API externa não reserva nem vende lote atomicamente" e acrescentar:

```markdown
| Endpoint de reserva em `bilhete.reservado` não publicado | reserva externa desligada (`none`) | API publicar `PUT`/`GET` com update condicional; ajustar `RESERVATION_PATH` e ativar `live` |
| Token de reserva é `data_reservado` (precisão de segundos) | reenvio raro pode liberar trava alheia | API aceitar token próprio (coluna nova ou `numorder`) |
| `PUT /bilhete/validar` não é condicional à reserva | janela entre `GET` de posse e validação | API validar só com `validado = 0` e token da reserva |
| Surpresinha não troca bilhete em conflito externo | cliente precisa tentar de novo | medir frequência de `TICKET_RESERVED` em surpresinha |
```

- [x] **Passo 5: verificação** — rodar `npm run check` e `npm run test:e2e`. Esperado: ambos passam. Registrar resultado em "Validação" abaixo.

- [x] **Passo 6: commit**

```bash
git add docs/
git commit -m "docs: registrar concorrência na reserva de bilhetes"
```

---

## Ativação quando os endpoints existirem

1. Confirmar com a equipe da API de bilhetes: caminho, nomes de campo, formato de `data_reservado`, códigos `409`/`404` e que a reserva é uma atualização condicional única (SQL da seção "Contrato pedido").
2. Ajustar somente `RESERVATION_PATH`, schemas e corpo em `server/domains/tickets/live-ticket-reservation-gateway.ts`, e os testes do mesmo nome.
3. Alinhar `TICKET_RESERVATION_TTL_MINUTES` com o prazo configurado na API.
4. Em homologação: `TICKET_PROVIDER=live`, `TICKET_RESERVATION_PROVIDER=live`; criar dois pedidos simultâneos da mesmo bilhete (um deve receber `409`); deixar um pedido expirar e conferir `reservado = 0` no banco; pagar um pedido e conferir `validado = 1`.
5. Mover as linhas correspondentes do rastreador de dívida e este plano para `completed/`.

## Progresso

- 2026-09-27: plano criado e aprovado.
- 2026-09-27: tarefas 1 a 8 executadas na branch `feat/concorrencia-reserva-bilhete`, um commit por tarefa. Provider padrão `none`; ativação `live` pendente da API de bilhetes (ver "Ativação" e rastreador de dívida).

## Validação

- 2026-09-27: `npm run lint`, `validate:architecture`, `validate:docs`, `npm test` (22 arquivos, 111 testes) e `npm run build` passaram.
- 2026-09-27: `npm run format` continua falhando por 13 arquivos que já estavam fora do padrão no `main` antes deste trabalho; os arquivos criados ou alterados aqui estão formatados.
- 2026-09-27: `npm run test:e2e` passou (10 testes, chromium e mobile).
