# Login de cliente — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar tarefa por tarefa. Passos usam checkbox (`- [ ]`).

**Objetivo:** trocar a consulta de compras por CPF por conta de cliente (CPF + senha) com verificação por código de e-mail, e exigir conta no checkout.

**Arquitetura:** domínio novo `server/domains/accounts` (conta local no SQLite com hash `scrypt`, sessão por cookie `HttpOnly`, códigos de verificação, porta de e-mail mock/SMTP) que grava a pessoa na API externa por `POST /pessoa/cadastro`. Rotas `/api/v1/account/*`; `POST /api/v1/orders` e `GET /api/v1/orders/mine` usam a sessão. No frontend, feature `src/features/account` com fluxo `AuthFlow` reaproveitado em `/entrar` e no carrinho.

**Tecnologias:** Fastify 5, `@fastify/cookie`, `node:sqlite`, `node:crypto`, Nodemailer (novo), Zod 4, React 19, React Query 5, React Hook Form, Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-10-16-login-cliente-design.md](../../superpowers/specs/2026-10-16-login-cliente-design.md)

## Restrições globais

- TypeScript estrito, sem `any`, sem `as` sobre dado externo; Zod na fronteira.
- Textos de usuário e documentação em português brasileiro.
- Camadas do frontend: `domain → api → repository → service → runtime → ui`; páginas não fazem HTTP; só o repository chama `requestJson`.
- Senha de cliente: mínimo 8 caracteres, máximo 128. Código: 6 dígitos, 15 min, 5 tentativas, reenvio após 60 s. Código do admin: 24 h. Sessão: 30 dias sem uso.
- Cookie `customer_session`: `HttpOnly`, `SameSite=Strict`, `Secure` quando `PUBLIC_APP_URL` é HTTPS, `path=/api`.
- Código e senha nunca em log, URL ou resposta (exceto o código do admin, mostrado uma vez ao admin).
- E-mail de destino de primeiro acesso e "esqueci a senha" vem do cadastro, nunca do navegador.
- Com `MAIL_PROVIDER=mock`, o código é sempre `000000`.
- `npm run check` ao fim de cada tarefa; `npm run test:e2e` nas tarefas 13 e 14.

## Critérios de aceite

- Cabeçalho tem **Entrar** ao lado do carrinho; logado, **Minha conta** com Minhas compras, Meus dados e Sair.
- CPF com conta entra com senha; CPF na API sem conta faz primeiro acesso por código no e-mail do cadastro; CPF na API sem e-mail vê orientação e pode usar código do admin; CPF novo se cadastra após validar o e-mail.
- Checkout sem sessão mostra o fluxo de entrar/cadastrar; com sessão usa os dados da conta.
- "Minhas compras" só com sessão; não existe mais consulta por CPF.
- Rotas `GET /api/v1/customers/lookup` e `POST /api/v1/orders/lookup` removidas.

## Mapa de arquivos

Backend:

- `server/shared/password.ts` — movido de `server/domains/admin/password.ts`.
- `server/shared/database-migrations.ts` — migração v8 (`ACCOUNT_SCHEMA`).
- `server/domains/accounts/account-types.ts` — schemas e tipos.
- `server/domains/accounts/account-repository.ts` — contas, sessões, códigos.
- `server/domains/accounts/verification-service.ts` — emissão e conferência de códigos.
- `server/domains/accounts/account-service.ts` — identify, login, cadastro, senha, perfil, sessão.
- `server/domains/accounts/mail-gateway.ts`, `mock-mail-gateway.ts`, `smtp-mail-gateway.ts` — porta e providers de e-mail.
- `server/domains/customers/*` — `register()` no gateway.
- `server/domains/admin/admin-customer-access-service.ts` — código de primeiro acesso pelo admin.
- `server/http/customer-session.ts` — cookie, leitura da sessão, checagem de `Origin`.
- `server/http/account-routes.ts` — rotas `/api/v1/account/*`.
- `server/http/routes.ts`, `admin-routes.ts`, `server/app.ts`, `server/config/env.ts` — alterados.

Frontend:

- `src/features/account/{domain,api,repository,service,runtime,ui}` — feature nova.
- `src/features/checkout/*` — pedido sem `customer`; remove consulta de cliente.
- `src/features/purchases/*` — `listMine`.
- `src/features/admin/*` e `src/pages/admin/AdminCustomersPage.tsx` — botão de código.
- `src/app/AppLayout.tsx`, `src/app/App.tsx`, `src/pages/{LoginPage,AccountPage,CartPage,PurchasesPage,PaymentPage}.tsx`.
- `tests/e2e/helpers/account.ts` e specs E2E.

---

### Tarefa 0: Validar o contrato de `POST /pessoa/cadastro`

**Bloqueante para a tarefa 4.** Grava na API real: só execute com autorização explícita do responsável e com o CPF de teste que ele indicar. Sem autorização, pule para a tarefa 1 e volte aqui antes da tarefa 4.

**Arquivos:** modificar `docs/API_CONTRACTS.md` (seção da API de bilhetes).

- [ ] **Passo 1: consultar o CPF de teste antes**

```bash
curl -s http://66.94.99.64:9090/pessoa/cpf/<CPF_TESTE> | python3 -m json.tool
```

Esperado: `404` (CPF novo) ou o cadastro atual. Anote a resposta.

- [ ] **Passo 2: cadastrar com todos os campos**

```bash
curl -s -X POST http://66.94.99.64:9090/pessoa/cadastro -H 'Content-Type: application/json' \
  -d '{"nome":"TESTE SITE","cpf":"<CPF_TESTE>","senha":"teste1234","confirma_senha":"teste1234","email":"<EMAIL_TESTE>","fone":"84999990000","cep":"59062300","endereco":"AVENIDA TESTE","numero":"1","complemento":"","bairro":"CENTRO","cidade":"NATAL","uf":"RN"}' -w '\n%{http_code}\n'
```

Anote status e corpo (traz `pessoas_id`?).

- [ ] **Passo 3: reler e conferir quais campos foram gravados**

```bash
curl -s http://66.94.99.64:9090/pessoa/cpf/<CPF_TESTE> | python3 -m json.tool
```

- [ ] **Passo 4: editar só o nome, sem senha**

Repita o passo 2 trocando `nome` para `"TESTE SITE 2"` e removendo `senha`/`confirma_senha`. Anote se aceita. Depois envie de novo com senha e sem `endereco`/`bairro`, e releia (passo 3) para saber se campos omitidos são apagados.

- [ ] **Passo 5: registrar o contrato**

Em `docs/API_CONTRACTS.md`, substitua a linha de `POST /pessoa` por uma de `POST /pessoa/cadastro` com o que foi observado: campos aceitos, se a senha é obrigatória na edição, se omitir apaga, formato da resposta e códigos de erro. Se algum campo de endereço não for gravado, registre que ele fica só em `customer_accounts.address_json`.

Ajustes na tarefa 4 conforme o resultado:

- Senha obrigatória na edição: já previsto (perfil pede a senha atual).
- Omitir apaga: o gateway sempre envia todos os campos (já previsto).
- Resposta traz `pessoas_id`: pode-se dispensar a releitura por CPF, mas mantenha-a (é a salvaguarda atual).

- [ ] **Passo 6: commit**

```bash
git add docs/API_CONTRACTS.md
git commit -m "docs: contrato observado de POST /pessoa/cadastro"
```

---

### Tarefa 1: Mover `password.ts` para `server/shared`

**Arquivos:**

- Mover: `server/domains/admin/password.ts` → `server/shared/password.ts`
- Modificar: todo import de `./password.js` em `server/domains/admin/` e testes.

**Interfaces:**

- Produz: `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, stored: string): Promise<boolean>` em `server/shared/password.ts`.

- [ ] **Passo 1: mover e ajustar imports**

```bash
git mv server/domains/admin/password.ts server/shared/password.ts
grep -rln "password.js'" server | xargs sed -i "s#from './password.js'#from '../../shared/password.js'#"
grep -rn "password.js'" server
```

Esperado: todos os imports apontam para `../../shared/password.js` (ajuste à mão algum caminho diferente, como em `server/app.ts` ou `server/config`).

- [ ] **Passo 2: rodar os testes do admin**

Run: `npx vitest run server/domains/admin server/http/admin-routes.test.ts`
Esperado: PASS.

- [ ] **Passo 3: commit**

```bash
git add -A server
git commit -m "refactor: mover hash de senha para server/shared"
```

---

### Tarefa 2: Migração v8 e `AccountRepository`

**Arquivos:**

- Modificar: `server/shared/database-migrations.ts`
- Criar: `server/domains/accounts/account-types.ts`, `server/domains/accounts/account-repository.ts`
- Teste: `server/domains/accounts/account-repository.test.ts`

**Interfaces:**

- Produz (`account-types.ts`): `cpfSchema`, `customerPasswordSchema`, `verificationCodeSchema`, `codePurposeSchema`, `type CodePurpose = 'signup' | 'first_access' | 'reset' | 'admin'`, `profileSchema`, `type Profile`, `type Account = { cpf; externalId; name; email: string | null; phone; address?: Address }`, `type IdentifyResult`, `maskEmail(email)`, schemas de entrada das rotas.
- Produz (`account-repository.ts`): classe `AccountRepository(database)` com `findAccount(cpf): StoredAccount | null`, `saveAccount(account: Account, passwordHash: string, now: string)`, `updateProfile(account: Account, now: string)`, `updatePassword(cpf, passwordHash, now)`, `insertSession(tokenHash, cpf, createdAt, expiresAt)`, `findSession(tokenHash): { cpf; lastSeenAt; expiresAt } | null`, `touchSession(tokenHash, lastSeenAt, expiresAt)`, `deleteSession(tokenHash)`, `deleteCpfSessions(cpf, exceptTokenHash?)`, `deleteExpiredSessions(now)`, `insertCode(code: NewCode): number`, `findActiveCode(cpf, purposes: CodePurpose[], now): StoredCode | null`, `lastCodeCreatedAt(cpf, purpose): string | null`, `incrementCodeAttempts(id)`, `markCodeUsed(id, now)`. `StoredAccount = Account & { passwordHash: string }`; `StoredCode = { id; cpf; purpose; codeHash; email: string | null; attempts; expiresAt }`.

- [ ] **Passo 1: tipos**

`server/domains/accounts/account-types.ts`:

```ts
import { z } from 'zod'
import { addressSchema, customerInputSchema, type Address } from '../customers/customer-types.js'

export const cpfSchema = z.string().regex(/^\d{11}$/, 'Informe um CPF com 11 dígitos.')
export const customerPasswordSchema = z
  .string()
  .min(8, 'A senha precisa ter ao menos 8 caracteres.')
  .max(128)
export const verificationCodeSchema = z.string().regex(/^\d{6}$/, 'Informe o código de 6 dígitos.')
export const codePurposeSchema = z.enum(['signup', 'first_access', 'reset', 'admin'])
const emailSchema = z.string().trim().toLowerCase().max(160).pipe(z.email())

// Cadastro completo: exigido no cadastro novo, na edição de perfil e para comprar.
export const profileSchema = z.object({
  name: z.string().trim().min(3).max(120),
  cpf: cpfSchema,
  phone: customerInputSchema.shape.phone,
  email: emailSchema,
  address: addressSchema,
})

export const loginInputSchema = z
  .object({ cpf: cpfSchema, password: z.string().min(1).max(128) })
  .strict()
export const identifyInputSchema = z.object({ cpf: cpfSchema }).strict()
export const requestCodeInputSchema = z.discriminatedUnion('purpose', [
  z.object({ purpose: z.literal('signup'), cpf: cpfSchema, email: emailSchema }).strict(),
  z.object({ purpose: z.enum(['first_access', 'reset']), cpf: cpfSchema }).strict(),
])
export const registerInputSchema = z
  .object({
    customer: profileSchema,
    password: customerPasswordSchema,
    code: verificationCodeSchema,
  })
  .strict()
export const setPasswordInputSchema = z
  .object({
    cpf: cpfSchema,
    code: verificationCodeSchema,
    password: customerPasswordSchema,
    email: emailSchema.optional(),
  })
  .strict()
export const updateProfileInputSchema = z
  .object({
    customer: profileSchema.omit({ cpf: true }),
    currentPassword: z.string().min(1).max(128),
  })
  .strict()

export type CodePurpose = z.infer<typeof codePurposeSchema>
export type Profile = z.output<typeof profileSchema>
export type Account = {
  cpf: string
  externalId: string
  name: string
  email: string | null
  phone: string
  address?: Address
}
export type IdentifyResult =
  | { status: 'account' }
  | { status: 'first_access'; maskedEmail: string }
  | { status: 'no_email' }
  | { status: 'new' }
export type RequestCodeInput = z.output<typeof requestCodeInputSchema>
export type RegisterInput = z.output<typeof registerInputSchema>
export type SetPasswordInput = z.output<typeof setPasswordInputSchema>
export type UpdateProfileInput = z.output<typeof updateProfileInputSchema>

export function maskEmail(email: string) {
  const [user = '', domain = ''] = email.split('@')
  return `${user.slice(0, 2)}***@${domain}`
}

export function isProfileComplete(account: Account) {
  return profileSchema.safeParse(account).success
}
```

- [ ] **Passo 2: teste do repositório (falhando)**

`server/domains/accounts/account-repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createDatabase } from '../../shared/database.js'
import { AccountRepository } from './account-repository.js'

const account = {
  cpf: '52998224725',
  externalId: '2015',
  name: 'Maria da Silva',
  email: 'maria@example.com',
  phone: '84999855367',
}

function setup() {
  return new AccountRepository(createDatabase(':memory:'))
}

describe('AccountRepository', () => {
  it('grava e lê conta com hash de senha', () => {
    const repository = setup()
    repository.saveAccount(account, 'hash-1', '2026-10-16T12:00:00.000Z')
    expect(repository.findAccount(account.cpf)).toEqual({ ...account, passwordHash: 'hash-1' })
  })

  it('encerra as sessões do CPF exceto a atual', () => {
    const repository = setup()
    repository.saveAccount(account, 'hash-1', '2026-10-16T12:00:00.000Z')
    repository.insertSession(
      'a',
      account.cpf,
      '2026-10-16T12:00:00.000Z',
      '2026-11-15T12:00:00.000Z',
    )
    repository.insertSession(
      'b',
      account.cpf,
      '2026-10-16T12:00:00.000Z',
      '2026-11-15T12:00:00.000Z',
    )
    repository.deleteCpfSessions(account.cpf, 'b')
    expect(repository.findSession('a')).toBeNull()
    expect(repository.findSession('b')).toMatchObject({ cpf: account.cpf })
  })

  it('código novo invalida o anterior da mesma finalidade', () => {
    const repository = setup()
    const base = {
      cpf: account.cpf,
      purpose: 'reset' as const,
      email: account.email,
      createdAt: '2026-10-16T12:00:00.000Z',
      expiresAt: '2026-10-16T12:15:00.000Z',
      createdByAdminId: null,
    }
    repository.insertCode({ ...base, codeHash: 'h1' })
    repository.insertCode({ ...base, codeHash: 'h2' })
    const active = repository.findActiveCode(account.cpf, ['reset'], '2026-10-16T12:01:00.000Z')
    expect(active?.codeHash).toBe('h2')
  })

  it('não devolve código expirado ou usado', () => {
    const repository = setup()
    const id = repository.insertCode({
      cpf: account.cpf,
      purpose: 'signup',
      codeHash: 'h1',
      email: account.email,
      createdAt: '2026-10-16T12:00:00.000Z',
      expiresAt: '2026-10-16T12:15:00.000Z',
      createdByAdminId: null,
    })
    expect(
      repository.findActiveCode(account.cpf, ['signup'], '2026-10-16T12:16:00.000Z'),
    ).toBeNull()
    repository.markCodeUsed(id, '2026-10-16T12:02:00.000Z')
    expect(
      repository.findActiveCode(account.cpf, ['signup'], '2026-10-16T12:03:00.000Z'),
    ).toBeNull()
  })
})
```

Run: `npx vitest run server/domains/accounts/account-repository.test.ts`
Esperado: FAIL (módulo não existe).

- [ ] **Passo 3: migração v8**

Em `server/shared/database-migrations.ts`: `CURRENT_SCHEMA_VERSION = 8`; adicionar `if (version < 8) migrateToVersion8(database)` no ramo de migração; em `createLatestSchema`, executar também `ACCOUNT_SCHEMA` (no mesmo lugar onde `ADMIN_SCHEMA` é executado). Adicionar:

```ts
const ACCOUNT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS customer_accounts (
    cpf TEXT PRIMARY KEY,
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT NOT NULL,
    address_json TEXT,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    password_changed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customer_sessions (
    token_hash TEXT PRIMARY KEY,
    cpf TEXT NOT NULL REFERENCES customer_accounts(cpf) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_customer_sessions_cpf ON customer_sessions(cpf);

  CREATE TABLE IF NOT EXISTS verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cpf TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    email TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_by_admin_id TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_verification_codes_cpf ON verification_codes(cpf, purpose);
`

function migrateToVersion8(database: DatabaseSync) {
  database.exec(ACCOUNT_SCHEMA)
}
```

Se `server/shared/database.test.ts` verifica a versão do schema, atualize o valor esperado para 8.

- [ ] **Passo 4: repositório**

`server/domains/accounts/account-repository.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { addressSchema } from '../customers/customer-types.js'
import { codePurposeSchema, type Account, type CodePurpose } from './account-types.js'

const accountRowSchema = z.object({
  cpf: z.string(),
  external_id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string(),
  address_json: z.string().nullable(),
  password_hash: z.string(),
})

const sessionRowSchema = z.object({
  cpf: z.string(),
  last_seen_at: z.string(),
  expires_at: z.string(),
})

const codeRowSchema = z.object({
  id: z.number().int(),
  cpf: z.string(),
  purpose: codePurposeSchema,
  code_hash: z.string(),
  email: z.string().nullable(),
  attempts: z.number().int(),
  expires_at: z.string(),
})

export type StoredAccount = Account & { passwordHash: string }
export type StoredCode = {
  id: number
  cpf: string
  purpose: CodePurpose
  codeHash: string
  email: string | null
  attempts: number
  expiresAt: string
}
export type NewCode = {
  cpf: string
  purpose: CodePurpose
  codeHash: string
  email: string | null
  createdAt: string
  expiresAt: string
  createdByAdminId: string | null
}

export class AccountRepository {
  constructor(private readonly database: DatabaseSync) {}

  findAccount(cpf: string): StoredAccount | null {
    const row = this.database.prepare('SELECT * FROM customer_accounts WHERE cpf = ?').get(cpf)
    if (!row) return null
    const parsed = accountRowSchema.parse(row)
    const address = parsed.address_json
      ? addressSchema.safeParse(JSON.parse(parsed.address_json))
      : null
    return {
      cpf: parsed.cpf,
      externalId: parsed.external_id,
      name: parsed.name,
      email: parsed.email,
      phone: parsed.phone,
      ...(address?.success ? { address: address.data } : {}),
      passwordHash: parsed.password_hash,
    }
  }

  saveAccount(account: Account, passwordHash: string, now: string) {
    this.database
      .prepare(
        `INSERT INTO customer_accounts
           (cpf, external_id, name, email, phone, address_json, password_hash,
            created_at, updated_at, password_changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(cpf) DO UPDATE SET
           external_id = excluded.external_id, name = excluded.name, email = excluded.email,
           phone = excluded.phone, address_json = excluded.address_json,
           password_hash = excluded.password_hash, updated_at = excluded.updated_at,
           password_changed_at = excluded.password_changed_at`,
      )
      .run(
        account.cpf,
        account.externalId,
        account.name,
        account.email,
        account.phone,
        account.address ? JSON.stringify(account.address) : null,
        passwordHash,
        now,
        now,
        now,
      )
  }

  updateProfile(account: Account, now: string) {
    this.database
      .prepare(
        `UPDATE customer_accounts
         SET name = ?, email = ?, phone = ?, address_json = ?, updated_at = ?
         WHERE cpf = ?`,
      )
      .run(
        account.name,
        account.email,
        account.phone,
        account.address ? JSON.stringify(account.address) : null,
        now,
        account.cpf,
      )
  }

  updatePassword(cpf: string, passwordHash: string, now: string) {
    this.database
      .prepare(
        `UPDATE customer_accounts
         SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE cpf = ?`,
      )
      .run(passwordHash, now, now, cpf)
  }

  insertSession(tokenHash: string, cpf: string, createdAt: string, expiresAt: string) {
    this.database
      .prepare(
        `INSERT INTO customer_sessions (token_hash, cpf, created_at, last_seen_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(tokenHash, cpf, createdAt, createdAt, expiresAt)
  }

  findSession(tokenHash: string) {
    const row = this.database
      .prepare('SELECT cpf, last_seen_at, expires_at FROM customer_sessions WHERE token_hash = ?')
      .get(tokenHash)
    if (!row) return null
    const parsed = sessionRowSchema.parse(row)
    return { cpf: parsed.cpf, lastSeenAt: parsed.last_seen_at, expiresAt: parsed.expires_at }
  }

  touchSession(tokenHash: string, lastSeenAt: string, expiresAt: string) {
    this.database
      .prepare('UPDATE customer_sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?')
      .run(lastSeenAt, expiresAt, tokenHash)
  }

  deleteSession(tokenHash: string) {
    this.database.prepare('DELETE FROM customer_sessions WHERE token_hash = ?').run(tokenHash)
  }

  deleteCpfSessions(cpf: string, exceptTokenHash?: string) {
    this.database
      .prepare('DELETE FROM customer_sessions WHERE cpf = ? AND token_hash IS NOT ?')
      .run(cpf, exceptTokenHash ?? null)
  }

  deleteExpiredSessions(now: string) {
    this.database.prepare('DELETE FROM customer_sessions WHERE expires_at <= ?').run(now)
  }

  // Só um código ativo por CPF e finalidade: emitir outro descarta os anteriores não usados.
  insertCode(code: NewCode) {
    this.database
      .prepare('DELETE FROM verification_codes WHERE cpf = ? AND purpose = ? AND used_at IS NULL')
      .run(code.cpf, code.purpose)
    const result = this.database
      .prepare(
        `INSERT INTO verification_codes
           (cpf, purpose, code_hash, email, created_at, expires_at, created_by_admin_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        code.cpf,
        code.purpose,
        code.codeHash,
        code.email,
        code.createdAt,
        code.expiresAt,
        code.createdByAdminId,
      )
    return Number(result.lastInsertRowid)
  }

  findActiveCode(cpf: string, purposes: CodePurpose[], now: string): StoredCode | null {
    const placeholders = purposes.map(() => '?').join(', ')
    const row = this.database
      .prepare(
        `SELECT id, cpf, purpose, code_hash, email, attempts, expires_at
         FROM verification_codes
         WHERE cpf = ? AND purpose IN (${placeholders}) AND used_at IS NULL AND expires_at > ?
         ORDER BY id DESC LIMIT 1`,
      )
      .get(cpf, ...purposes, now)
    if (!row) return null
    const parsed = codeRowSchema.parse(row)
    return {
      id: parsed.id,
      cpf: parsed.cpf,
      purpose: parsed.purpose,
      codeHash: parsed.code_hash,
      email: parsed.email,
      attempts: parsed.attempts,
      expiresAt: parsed.expires_at,
    }
  }

  lastCodeCreatedAt(cpf: string, purpose: CodePurpose) {
    const row = this.database
      .prepare(
        'SELECT MAX(created_at) AS created_at FROM verification_codes WHERE cpf = ? AND purpose = ?',
      )
      .get(cpf, purpose)
    return z.object({ created_at: z.string().nullable() }).parse(row).created_at
  }

  incrementCodeAttempts(id: number) {
    this.database
      .prepare('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?')
      .run(id)
  }

  markCodeUsed(id: number, now: string) {
    this.database.prepare('UPDATE verification_codes SET used_at = ? WHERE id = ?').run(now, id)
  }
}
```

- [ ] **Passo 5: rodar**

Run: `npx vitest run server/domains/accounts server/shared`
Esperado: PASS.

- [ ] **Passo 6: commit**

```bash
git add server/shared/database-migrations.ts server/shared/database.test.ts server/domains/accounts
git commit -m "feat(accounts): migração v8 e repositório de contas de cliente"
```

---

### Tarefa 3: Porta de e-mail (mock e SMTP) e variáveis de ambiente

**Arquivos:**

- Criar: `server/domains/accounts/mail-gateway.ts`, `mock-mail-gateway.ts`, `smtp-mail-gateway.ts`
- Modificar: `server/config/env.ts`, `server/config/env.test.ts`, `.env.example`, `package.json`
- Teste: `server/config/env.test.ts`

**Interfaces:**

- Produz: `interface MailGateway { sendVerificationCode(to: string, code: string): Promise<void> }`; `MockMailGateway` com `readonly sent: Array<{ to: string; code: string }>`; `SmtpMailGateway(env: ServerEnv)`.
- Produz: `ServerEnv` com `MAIL_PROVIDER: 'mock' | 'smtp'`, `SMTP_HOST?`, `SMTP_PORT?`, `SMTP_SECURE: boolean`, `SMTP_USER?`, `SMTP_PASS?`, `MAIL_FROM?`.

- [ ] **Passo 1: instalar Nodemailer**

```bash
npm install nodemailer && npm install -D @types/nodemailer
```

- [ ] **Passo 2: teste de ambiente (falhando)**

Em `server/config/env.test.ts`, acrescentar:

```ts
it('usa e-mail mock por padrão', () => {
  expect(parseServerEnv({}).MAIL_PROVIDER).toBe('mock')
})

it('exige configuração SMTP completa com MAIL_PROVIDER=smtp', () => {
  expect(() => parseServerEnv({ MAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example.com' })).toThrow(
    /SMTP_USER/,
  )
})

it('aceita SMTP completo', () => {
  const env = parseServerEnv({
    MAIL_PROVIDER: 'smtp',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'user',
    SMTP_PASS: 'pass',
    MAIL_FROM: 'Sol da Sorte <nao-responda@example.com>',
  })
  expect(env.SMTP_PORT).toBe(587)
  expect(env.SMTP_SECURE).toBe(false)
})
```

Run: `npx vitest run server/config/env.test.ts`
Esperado: FAIL.

- [ ] **Passo 3: variáveis**

Em `serverEnvSchema` (`server/config/env.ts`), adicionar ao objeto:

```ts
MAIL_PROVIDER: z.enum(['mock', 'smtp']).default('mock'),
SMTP_HOST: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
SMTP_SECURE: z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true'),
SMTP_USER: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
SMTP_PASS: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
MAIL_FROM: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
```

E, no `superRefine` existente:

```ts
if (env.MAIL_PROVIDER === 'smtp') {
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'] as const) {
    if (!env[key]) {
      context.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} é obrigatório com MAIL_PROVIDER=smtp`,
      })
    }
  }
}
```

Em `.env.example`, após o bloco do admin:

```bash
# E-mail dos códigos de verificação do login de cliente.
# mock: não envia e aceita sempre o código 000000 (só desenvolvimento e testes).
# smtp: qualquer SMTP (Gmail com senha de app, Brevo, Resend). SMTP_SECURE=true para porta 465.
MAIL_PROVIDER=mock
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Sol da Sorte <nao-responda@exemplo.com.br>"
```

- [ ] **Passo 4: porta e providers**

`server/domains/accounts/mail-gateway.ts`:

```ts
export interface MailGateway {
  sendVerificationCode(to: string, code: string): Promise<void>
}

export function verificationEmailText(code: string) {
  return [
    `Seu código de acesso à Sol da Sorte é ${code}.`,
    'Ele vale por 15 minutos.',
    'Ninguém da Sol da Sorte pede este código. Se você não pediu, ignore este e-mail.',
  ].join('\n\n')
}
```

`server/domains/accounts/mock-mail-gateway.ts`:

```ts
import type { MailGateway } from './mail-gateway.js'

// Guarda os envios em memória para testes; nada sai do processo.
export class MockMailGateway implements MailGateway {
  readonly sent: Array<{ to: string; code: string }> = []

  async sendVerificationCode(to: string, code: string) {
    this.sent.push({ to, code })
  }
}
```

`server/domains/accounts/smtp-mail-gateway.ts`:

```ts
import nodemailer, { type Transporter } from 'nodemailer'
import type { ServerEnv } from '../../config/env.js'
import { DomainError } from '../../shared/errors.js'
import { verificationEmailText, type MailGateway } from './mail-gateway.js'

export class SmtpMailGateway implements MailGateway {
  private readonly transporter: Transporter
  private readonly from: string

  constructor(env: ServerEnv) {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
    this.from = env.MAIL_FROM ?? ''
  }

  async sendVerificationCode(to: string, code: string) {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Seu código de acesso Sol da Sorte',
        text: verificationEmailText(code),
      })
    } catch {
      // O erro do SMTP pode conter o corpo da mensagem; não é repassado para não vazar o código.
      throw new DomainError(
        'Não foi possível enviar o e-mail agora. Tente novamente em instantes.',
        503,
        'MAIL_UNAVAILABLE',
      )
    }
  }
}
```

- [ ] **Passo 5: rodar**

Run: `npx vitest run server/config`
Esperado: PASS.

- [ ] **Passo 6: commit**

```bash
git add package.json package-lock.json .env.example server/config server/domains/accounts/*mail*
git commit -m "feat(accounts): porta de e-mail com providers mock e SMTP"
```

---

### Tarefa 4: `register()` no `CustomerGateway`

Depende da tarefa 0 (ajuste o mapeamento de campos ao contrato observado).

**Arquivos:**

- Modificar: `server/domains/customers/customer-gateway.ts`, `customer-types.ts`, `live-customer-gateway.ts`, `mock-customer-gateway.ts`
- Teste: `server/domains/customers/live-customer-gateway.test.ts`

**Interfaces:**

- Produz: `type CustomerRegistration = { name; cpf; phone; email: string | null; address?: Address; password: string }`; `CustomerGateway.register(input: CustomerRegistration): Promise<void>`.
- Mock: Maria (`52998224725`) passa a ter `email: 'maria@example.com'`; `register` faz upsert por CPF.

- [ ] **Passo 1: teste do gateway live (falhando)**

Em `live-customer-gateway.test.ts`, seguindo o padrão de `fetch` simulado do arquivo:

```ts
it('cadastra ou edita pessoa por POST /pessoa/cadastro com senha', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }, { status: 201 }))
  vi.stubGlobal('fetch', fetchMock)
  const gateway = new LiveCustomerGateway('https://api.example.com')

  await gateway.register({
    name: 'Maria da Silva',
    cpf: '52998224725',
    phone: '84999855367',
    email: 'maria@example.com',
    address: {
      zipCode: '59062300',
      street: 'AVENIDA LIMA E SILVA',
      number: '129',
      neighborhood: 'NAZARE',
      city: 'NATAL',
      state: 'RN',
    },
    password: 'senha-segura',
  })

  const [url, init] = fetchMock.mock.calls[0] ?? []
  expect(url).toBe('https://api.example.com/pessoa/cadastro')
  expect(JSON.parse(String(init?.body))).toMatchObject({
    nome: 'Maria da Silva',
    cpf: '52998224725',
    senha: 'senha-segura',
    confirma_senha: 'senha-segura',
    email: 'maria@example.com',
    fone: '84999855367',
    cep: '59062300',
    cidade: 'NATAL',
  })
})
```

Run: `npx vitest run server/domains/customers/live-customer-gateway.test.ts`
Esperado: FAIL (`register` não existe).

- [ ] **Passo 2: implementar**

`customer-types.ts`:

```ts
export type CustomerRegistration = {
  name: string
  cpf: string
  phone: string
  email: string | null
  address?: Address
  password: string
}
```

`customer-gateway.ts`: adicionar `register(input: CustomerRegistration): Promise<void>`.

`live-customer-gateway.ts`:

```ts
// Grava ou edita a pessoa; a API exige senha nos dois casos e substitui o cadastro inteiro.
async register(input: CustomerRegistration): Promise<void> {
  requireTicketApiTls(this.baseUrl, this.allowHttp)
  await fetchJson(`${this.baseUrl}/pessoa/cadastro`, mutationResponseSchema, {
    method: 'POST',
    body: JSON.stringify({
      nome: input.name,
      cpf: input.cpf,
      senha: input.password,
      confirma_senha: input.password,
      email: input.email ?? '',
      fone: input.phone,
      cep: input.address?.zipCode,
      endereco: input.address?.street,
      numero: input.address?.number,
      complemento: input.address?.complement,
      bairro: input.address?.neighborhood,
      cidade: input.address?.city,
      uf: input.address?.state,
    }),
  })
}
```

Ajuste o comentário e os campos ao resultado da tarefa 0. Confira em `server/shared/fetch-json.ts` se ele já define `Content-Type: application/json`; se não, passe `headers: { 'Content-Type': 'application/json' }` como `create()` faz.

`mock-customer-gateway.ts`: adicionar `email: 'maria@example.com'` em `maria` e:

```ts
async register(input: CustomerRegistration): Promise<void> {
  const index = this.customers.findIndex((customer) => customer.cpf === input.cpf)
  const customer = externalCustomerSchema.parse({
    externalId: this.customers[index]?.externalId ?? `mock-${this.customers.length + 1}`,
    name: input.name,
    cpf: input.cpf,
    phone: input.phone,
    email: input.email ?? undefined,
    address: input.address,
  })
  if (index >= 0) this.customers[index] = customer
  else this.customers.push(customer)
}
```

- [ ] **Passo 3: rodar a suíte de clientes e pedidos**

Run: `npx vitest run server/domains`
Esperado: PASS. Se algum teste assumia Maria sem e-mail, ajuste a expectativa (o e-mail do cadastro passa a ser usado quando o pedido não informa outro).

- [ ] **Passo 4: commit**

```bash
git add server/domains/customers
git commit -m "feat(customers): cadastro de pessoa por POST /pessoa/cadastro"
```

---

### Tarefa 5: `VerificationService`

**Arquivos:**

- Criar: `server/domains/accounts/verification-service.ts`
- Teste: `server/domains/accounts/verification-service.test.ts`

**Interfaces:**

- Consome: `AccountRepository` (tarefa 2), `MailGateway` (tarefa 3).
- Produz: classe `VerificationService(repository, mail, now = () => new Date(), generateCode = randomCode)` com:
  - `send(cpf: string, purpose: 'signup' | 'first_access' | 'reset', email: string): Promise<void>` — `429 CODE_RESEND_TOO_SOON` se o último da mesma finalidade tem menos de 60 s.
  - `issueForAdmin(cpf: string, adminUserId: string): string` — código `admin`, 24 h, sem e-mail.
  - `verify(cpf: string, purposes: CodePurpose[], code: string): StoredCode` — `400 INVALID_CODE` se ausente, expirado, esgotado ou errado (conta tentativa).
  - `markUsed(id: number): void`.
- Constantes exportadas: `CODE_TTL_MS = 15 * 60_000`, `ADMIN_CODE_TTL_MS = 24 * 60 * 60_000`, `RESEND_INTERVAL_MS = 60_000`, `MAX_CODE_ATTEMPTS = 5`.

- [ ] **Passo 1: testes (falhando)**

```ts
import { describe, expect, it } from 'vitest'
import { createDatabase } from '../../shared/database.js'
import { AccountRepository } from './account-repository.js'
import { MockMailGateway } from './mock-mail-gateway.js'
import { VerificationService } from './verification-service.js'

const cpf = '52998224725'

function setup(start = '2026-10-16T12:00:00.000Z') {
  let current = new Date(start)
  const mail = new MockMailGateway()
  const service = new VerificationService(
    new AccountRepository(createDatabase(':memory:')),
    mail,
    () => current,
    () => '123456',
  )
  return {
    service,
    mail,
    advance(ms: number) {
      current = new Date(current.getTime() + ms)
    },
  }
}

describe('VerificationService', () => {
  it('envia o código ao e-mail e o aceita uma vez', async () => {
    const { service, mail } = setup()
    await service.send(cpf, 'reset', 'maria@example.com')
    expect(mail.sent).toEqual([{ to: 'maria@example.com', code: '123456' }])

    const code = service.verify(cpf, ['reset'], '123456')
    expect(code.email).toBe('maria@example.com')
    service.markUsed(code.id)
    expect(() => service.verify(cpf, ['reset'], '123456')).toThrow(/código/i)
  })

  it('recusa código expirado', async () => {
    const { service, advance } = setup()
    await service.send(cpf, 'signup', 'novo@example.com')
    advance(15 * 60_000 + 1)
    expect(() => service.verify(cpf, ['signup'], '123456')).toThrow(/código/i)
  })

  it('bloqueia após 5 tentativas erradas, mesmo com o código certo', async () => {
    const { service } = setup()
    await service.send(cpf, 'reset', 'maria@example.com')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(() => service.verify(cpf, ['reset'], '000000')).toThrow()
    }
    expect(() => service.verify(cpf, ['reset'], '123456')).toThrow(/código/i)
  })

  it('exige 60 s entre envios', async () => {
    const { service, advance } = setup()
    await service.send(cpf, 'reset', 'maria@example.com')
    await expect(service.send(cpf, 'reset', 'maria@example.com')).rejects.toMatchObject({
      code: 'CODE_RESEND_TOO_SOON',
    })
    advance(60_000)
    await expect(service.send(cpf, 'reset', 'maria@example.com')).resolves.toBeUndefined()
  })

  it('código do admin vale 24 h e não envia e-mail', () => {
    const { service, mail, advance } = setup()
    expect(service.issueForAdmin(cpf, 'admin-1')).toBe('123456')
    expect(mail.sent).toEqual([])
    advance(23 * 60 * 60_000)
    expect(service.verify(cpf, ['admin'], '123456').purpose).toBe('admin')
  })
})
```

Run: `npx vitest run server/domains/accounts/verification-service.test.ts`
Esperado: FAIL.

- [ ] **Passo 2: implementar**

```ts
import { createHash, randomInt } from 'node:crypto'
import { DomainError } from '../../shared/errors.js'
import type { AccountRepository, StoredCode } from './account-repository.js'
import type { CodePurpose } from './account-types.js'
import type { MailGateway } from './mail-gateway.js'

export const CODE_TTL_MS = 15 * 60_000
export const ADMIN_CODE_TTL_MS = 24 * 60 * 60_000
export const RESEND_INTERVAL_MS = 60_000
export const MAX_CODE_ATTEMPTS = 5

function randomCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

// O CPF entra no hash para que o mesmo código em CPFs diferentes não gere o mesmo valor.
function hashCode(cpf: string, code: string) {
  return createHash('sha256').update(`${cpf}:${code}`).digest('hex')
}

function invalidCode() {
  return new DomainError('Código inválido ou expirado. Peça um novo código.', 400, 'INVALID_CODE')
}

export class VerificationService {
  constructor(
    private readonly repository: AccountRepository,
    private readonly mail: MailGateway,
    private readonly now: () => Date = () => new Date(),
    private readonly generateCode: () => string = randomCode,
  ) {}

  async send(cpf: string, purpose: Exclude<CodePurpose, 'admin'>, email: string) {
    const current = this.now()
    const last = this.repository.lastCodeCreatedAt(cpf, purpose)
    if (last && current.getTime() - Date.parse(last) < RESEND_INTERVAL_MS) {
      throw new DomainError(
        'Aguarde um minuto para pedir outro código.',
        429,
        'CODE_RESEND_TOO_SOON',
      )
    }
    const code = this.generateCode()
    this.repository.insertCode({
      cpf,
      purpose,
      codeHash: hashCode(cpf, code),
      email,
      createdAt: current.toISOString(),
      expiresAt: new Date(current.getTime() + CODE_TTL_MS).toISOString(),
      createdByAdminId: null,
    })
    await this.mail.sendVerificationCode(email, code)
  }

  issueForAdmin(cpf: string, adminUserId: string) {
    const current = this.now()
    const code = this.generateCode()
    this.repository.insertCode({
      cpf,
      purpose: 'admin',
      codeHash: hashCode(cpf, code),
      email: null,
      createdAt: current.toISOString(),
      expiresAt: new Date(current.getTime() + ADMIN_CODE_TTL_MS).toISOString(),
      createdByAdminId: adminUserId,
    })
    return code
  }

  // Não marca como usado: quem chama confirma o efeito externo antes de chamar `markUsed`.
  verify(cpf: string, purposes: CodePurpose[], code: string): StoredCode {
    const stored = this.repository.findActiveCode(cpf, purposes, this.now().toISOString())
    if (!stored || stored.attempts >= MAX_CODE_ATTEMPTS) throw invalidCode()
    if (stored.codeHash !== hashCode(cpf, code)) {
      this.repository.incrementCodeAttempts(stored.id)
      throw invalidCode()
    }
    return stored
  }

  markUsed(id: number) {
    this.repository.markCodeUsed(id, this.now().toISOString())
  }
}
```

- [ ] **Passo 3: rodar**

Run: `npx vitest run server/domains/accounts`
Esperado: PASS.

- [ ] **Passo 4: commit**

```bash
git add server/domains/accounts/verification-service*
git commit -m "feat(accounts): códigos de verificação por e-mail"
```

---

### Tarefa 6: `AccountService`

**Arquivos:**

- Criar: `server/domains/accounts/account-service.ts`
- Teste: `server/domains/accounts/account-service.test.ts`

**Interfaces:**

- Consome: `AccountRepository`, `VerificationService`, `CustomerGateway` (`findByCpf`, `register`), `hashPassword`/`verifyPassword`.
- Produz: `SESSION_IDLE_MS = 30 * 24 * 60 * 60_000`; `type CustomerSession = { account: Account; tokenHash: string }`; `type PublicAccount = Account & { complete: boolean }`; classe `AccountService(repository, customers, verification, now)` com:
  - `identify(cpf): Promise<IdentifyResult>`
  - `requestCode(input: RequestCodeInput): Promise<void>`
  - `login(cpf, password): Promise<{ token: string; account: Account }>`
  - `register(input: RegisterInput): Promise<{ token; account }>`
  - `setPassword(input: SetPasswordInput): Promise<{ token; account }>`
  - `updateProfile(session: CustomerSession, input: UpdateProfileInput): Promise<Account>`
  - `issueAdminCode(cpf, adminUserId): Promise<string>`
  - `authenticate(token: string | undefined): CustomerSession | null`
  - `logout(session: CustomerSession): void`
  - `toPublic(account: Account): PublicAccount`

- [ ] **Passo 1: testes (falhando)**

```ts
import { describe, expect, it } from 'vitest'
import { createDatabase } from '../../shared/database.js'
import { MockCustomerGateway } from '../customers/mock-customer-gateway.js'
import { AccountRepository } from './account-repository.js'
import { AccountService } from './account-service.js'
import { MockMailGateway } from './mock-mail-gateway.js'
import { VerificationService } from './verification-service.js'

const maria = '52998224725'
const newCpf = '11144477735'
const address = {
  zipCode: '59062300',
  street: 'AVENIDA LIMA E SILVA',
  number: '129',
  neighborhood: 'NAZARE',
  city: 'NATAL',
  state: 'RN',
}

function setup() {
  const repository = new AccountRepository(createDatabase(':memory:'))
  const customers = new MockCustomerGateway()
  const mail = new MockMailGateway()
  const now = () => new Date('2026-10-16T12:00:00.000Z')
  const verification = new VerificationService(repository, mail, now, () => '000000')
  return { service: new AccountService(repository, customers, verification, now), customers, mail }
}

describe('AccountService', () => {
  it('identifica CPF novo, CPF na API com e-mail e CPF sem e-mail', async () => {
    const { service, customers } = setup()
    expect(await service.identify(newCpf)).toEqual({ status: 'new' })
    expect(await service.identify(maria)).toEqual({
      status: 'first_access',
      maskedEmail: 'ma***@example.com',
    })
    await customers.register({
      name: 'Sem Email',
      cpf: '39053344705',
      phone: '84999990000',
      email: null,
      password: 'qualquer1',
    })
    expect(await service.identify('39053344705')).toEqual({ status: 'no_email' })
  })

  it('cadastra CPF novo só com código do e-mail informado e já entra', async () => {
    const { service, mail } = setup()
    await service.requestCode({ purpose: 'signup', cpf: newCpf, email: 'novo@example.com' })
    expect(mail.sent[0]?.to).toBe('novo@example.com')

    const result = await service.register({
      customer: {
        name: 'Cliente Novo',
        cpf: newCpf,
        phone: '84999998888',
        email: 'novo@example.com',
        address,
      },
      password: 'senha-nova-1',
      code: '000000',
    })
    expect(result.account.externalId).toMatch(/^mock-/)
    expect(await service.identify(newCpf)).toEqual({ status: 'account' })
    expect(service.authenticate(result.token)?.account.cpf).toBe(newCpf)
  })

  it('recusa cadastro com e-mail diferente do que recebeu o código', async () => {
    const { service } = setup()
    await service.requestCode({ purpose: 'signup', cpf: newCpf, email: 'novo@example.com' })
    await expect(
      service.register({
        customer: {
          name: 'X Y Z',
          cpf: newCpf,
          phone: '84999998888',
          email: 'outro@example.com',
          address,
        },
        password: 'senha-nova-1',
        code: '000000',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CODE' })
  })

  it('primeiro acesso envia código ao e-mail do cadastro e cria senha', async () => {
    const { service, mail } = setup()
    await service.requestCode({ purpose: 'first_access', cpf: maria })
    expect(mail.sent[0]?.to).toBe('maria@example.com')

    await service.setPassword({ cpf: maria, code: '000000', password: 'senha-maria-1' })
    await expect(service.login(maria, 'senha-maria-1')).resolves.toMatchObject({
      account: { cpf: maria, externalId: '2015' },
    })
  })

  it('login com senha errada ou CPF sem conta dá a mesma resposta', async () => {
    const { service } = setup()
    await service.requestCode({ purpose: 'first_access', cpf: maria })
    await service.setPassword({ cpf: maria, code: '000000', password: 'senha-maria-1' })
    await expect(service.login(maria, 'errada-123')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    })
    await expect(service.login(newCpf, 'errada-123')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    })
  })

  it('não cria conta local se a API falhar no cadastro', async () => {
    const { service, customers } = setup()
    customers.register = async () => {
      throw new Error('API fora do ar')
    }
    await service.requestCode({ purpose: 'signup', cpf: newCpf, email: 'novo@example.com' })
    await expect(
      service.register({
        customer: {
          name: 'Cliente Novo',
          cpf: newCpf,
          phone: '84999998888',
          email: 'novo@example.com',
          address,
        },
        password: 'senha-nova-1',
        code: '000000',
      }),
    ).rejects.toThrow()
    expect(await service.identify(newCpf)).toEqual({ status: 'new' })
  })

  it('código do admin permite primeiro acesso de CPF sem e-mail, exigindo e-mail', async () => {
    const { service, customers } = setup()
    await customers.register({
      name: 'Sem Email',
      cpf: '39053344705',
      phone: '84999990000',
      email: null,
      password: 'x1234567',
    })
    const code = await service.issueAdminCode('39053344705', 'admin-1')
    await expect(
      service.setPassword({ cpf: '39053344705', code, password: 'senha-nova-1' }),
    ).rejects.toMatchObject({ code: 'EMAIL_REQUIRED' })
    const result = await service.setPassword({
      cpf: '39053344705',
      code,
      password: 'senha-nova-1',
      email: 'sememail@example.com',
    })
    expect(result.account.email).toBe('sememail@example.com')
  })
})
```

Acrescente ao mesmo `describe` o teste de troca de senha, que precisa de relógio controlável (o reenvio exige 60 s):

```ts
it('troca de senha encerra as outras sessões', async () => {
  const repository = new AccountRepository(createDatabase(':memory:'))
  let current = new Date('2026-10-16T12:00:00.000Z')
  const now = () => current
  const verification = new VerificationService(
    repository,
    new MockMailGateway(),
    now,
    () => '000000',
  )
  const service = new AccountService(repository, new MockCustomerGateway(), verification, now)

  await service.requestCode({ purpose: 'first_access', cpf: maria })
  const first = await service.setPassword({ cpf: maria, code: '000000', password: 'senha-maria-1' })
  current = new Date(current.getTime() + 60_000)
  await service.requestCode({ purpose: 'reset', cpf: maria })
  const second = await service.setPassword({
    cpf: maria,
    code: '000000',
    password: 'senha-maria-2',
  })

  expect(service.authenticate(first.token)).toBeNull()
  expect(service.authenticate(second.token)?.account.cpf).toBe(maria)
})
```

Run: `npx vitest run server/domains/accounts/account-service.test.ts`
Esperado: FAIL.

- [ ] **Passo 2: implementar**

```ts
import { createHash, randomBytes } from 'node:crypto'
import { DomainError } from '../../shared/errors.js'
import { hashPassword, verifyPassword } from '../../shared/password.js'
import type { CustomerGateway } from '../customers/customer-gateway.js'
import type { AccountRepository } from './account-repository.js'
import {
  isProfileComplete,
  maskEmail,
  type Account,
  type IdentifyResult,
  type RegisterInput,
  type RequestCodeInput,
  type SetPasswordInput,
  type UpdateProfileInput,
} from './account-types.js'
import type { VerificationService } from './verification-service.js'

export const SESSION_IDLE_MS = 30 * 24 * 60 * 60_000
const TOUCH_INTERVAL_MS = 60_000

// Hash fictício: CPF sem conta gasta o mesmo tempo de scrypt que senha errada.
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'))

export type CustomerSession = { account: Account; tokenHash: string }
export type PublicAccount = Account & { complete: boolean }

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function invalidCredentials() {
  return new DomainError('CPF ou senha inválidos.', 401, 'INVALID_CREDENTIALS')
}

function accountExists() {
  return new DomainError(
    'Este CPF já tem cadastro. Entre com sua senha ou recupere o acesso.',
    409,
    'ACCOUNT_EXISTS',
  )
}

export class AccountService {
  constructor(
    private readonly repository: AccountRepository,
    private readonly customers: CustomerGateway,
    private readonly verification: VerificationService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async identify(cpf: string): Promise<IdentifyResult> {
    if (this.repository.findAccount(cpf)) return { status: 'account' }
    const person = await this.customers.findByCpf(cpf)
    if (!person) return { status: 'new' }
    return person.email
      ? { status: 'first_access', maskedEmail: maskEmail(person.email) }
      : { status: 'no_email' }
  }

  async requestCode(input: RequestCodeInput) {
    const local = this.repository.findAccount(input.cpf)
    if (input.purpose === 'signup') {
      if (local || (await this.customers.findByCpf(input.cpf))) throw accountExists()
      return this.verification.send(input.cpf, 'signup', input.email)
    }
    if (input.purpose === 'first_access' && local) throw accountExists()
    if (input.purpose === 'reset' && !local) {
      throw new DomainError(
        'Este CPF ainda não tem senha. Faça o primeiro acesso.',
        409,
        'ACCOUNT_NOT_FOUND',
      )
    }
    // Destino sempre vem do cadastro: nunca de entrada do navegador.
    const person = await this.customers.findByCpf(input.cpf)
    const email = person?.email ?? local?.email
    if (!email) {
      throw new DomainError(
        'Seu cadastro não tem e-mail. Procure a lotérica ou o suporte para incluir.',
        409,
        'EMAIL_NOT_REGISTERED',
      )
    }
    return this.verification.send(input.cpf, input.purpose, email)
  }

  async login(cpf: string, password: string) {
    const account = this.repository.findAccount(cpf)
    const valid = await verifyPassword(password, account?.passwordHash ?? (await DUMMY_HASH))
    if (!account || !valid) throw invalidCredentials()
    const { passwordHash: _hash, ...publicAccount } = account
    return { token: this.createSession(cpf), account: publicAccount }
  }

  async register(input: RegisterInput) {
    const { customer, password } = input
    if (
      this.repository.findAccount(customer.cpf) ||
      (await this.customers.findByCpf(customer.cpf))
    ) {
      throw accountExists()
    }
    const code = this.verification.verify(customer.cpf, ['signup'], input.code)
    if (code.email !== customer.email) {
      throw new DomainError(
        'Código inválido ou expirado. Peça um novo código.',
        400,
        'INVALID_CODE',
      )
    }

    await this.customers.register({ ...customer, password })
    const person = await this.customers.findByCpf(customer.cpf)
    if (!person) {
      throw new DomainError(
        'Cadastro não localizado após a criação.',
        502,
        'CUSTOMER_NOT_REGISTERED',
      )
    }

    const account: Account = { ...customer, externalId: person.externalId }
    this.repository.saveAccount(account, await hashPassword(password), this.now().toISOString())
    this.verification.markUsed(code.id)
    return { token: this.createSession(customer.cpf), account }
  }

  async setPassword(input: SetPasswordInput) {
    const code = this.verification.verify(input.cpf, ['first_access', 'reset', 'admin'], input.code)
    const person = await this.customers.findByCpf(input.cpf)
    const local = this.repository.findAccount(input.cpf)
    const base = local ?? person
    if (!base) throw new DomainError('Cadastro não encontrado.', 404, 'CUSTOMER_NOT_FOUND')

    // Código do admin é para quem não tem e-mail no cadastro: o e-mail informado passa a valer.
    const email =
      code.purpose === 'admin' ? (input.email ?? person?.email ?? local?.email) : code.email
    if (!email) {
      throw new DomainError(
        'Informe um e-mail para recuperar o acesso no futuro.',
        400,
        'EMAIL_REQUIRED',
      )
    }
    const externalId = person?.externalId ?? local?.externalId
    if (!externalId) throw new DomainError('Cadastro não encontrado.', 404, 'CUSTOMER_NOT_FOUND')

    const account: Account = {
      cpf: input.cpf,
      externalId,
      name: base.name,
      email,
      phone: base.phone,
      ...(base.address ? { address: base.address } : {}),
    }
    await this.customers.register({ ...account, password: input.password })
    this.repository.saveAccount(
      account,
      await hashPassword(input.password),
      this.now().toISOString(),
    )
    this.repository.deleteCpfSessions(input.cpf)
    this.verification.markUsed(code.id)
    return { token: this.createSession(input.cpf), account }
  }

  async updateProfile(session: CustomerSession, input: UpdateProfileInput) {
    const stored = this.repository.findAccount(session.account.cpf)
    if (!stored || !(await verifyPassword(input.currentPassword, stored.passwordHash))) {
      throw new DomainError('Senha atual incorreta.', 401, 'INVALID_CREDENTIALS')
    }
    const account: Account = { ...input.customer, cpf: stored.cpf, externalId: stored.externalId }
    await this.customers.register({ ...account, password: input.currentPassword })
    this.repository.updateProfile(account, this.now().toISOString())
    return account
  }

  async issueAdminCode(cpf: string, adminUserId: string) {
    if (!this.repository.findAccount(cpf) && !(await this.customers.findByCpf(cpf))) {
      throw new DomainError('CPF não encontrado no cadastro.', 404, 'CUSTOMER_NOT_FOUND')
    }
    return this.verification.issueForAdmin(cpf, adminUserId)
  }

  authenticate(token: string | undefined): CustomerSession | null {
    if (!token) return null
    const tokenHash = hashToken(token)
    const session = this.repository.findSession(tokenHash)
    if (!session) return null
    const current = this.now().getTime()
    const stored = this.repository.findAccount(session.cpf)
    if (Date.parse(session.expiresAt) <= current || !stored) {
      this.repository.deleteSession(tokenHash)
      return null
    }
    if (current - Date.parse(session.lastSeenAt) >= TOUCH_INTERVAL_MS) {
      this.repository.touchSession(
        tokenHash,
        new Date(current).toISOString(),
        new Date(current + SESSION_IDLE_MS).toISOString(),
      )
    }
    const { passwordHash: _hash, ...account } = stored
    return { account, tokenHash }
  }

  logout(session: CustomerSession) {
    this.repository.deleteSession(session.tokenHash)
  }

  toPublic(account: Account): PublicAccount {
    return { ...account, complete: isProfileComplete(account) }
  }

  private createSession(cpf: string) {
    const current = this.now()
    this.repository.deleteExpiredSessions(current.toISOString())
    const token = randomBytes(32).toString('base64url')
    this.repository.insertSession(
      hashToken(token),
      cpf,
      current.toISOString(),
      new Date(current.getTime() + SESSION_IDLE_MS).toISOString(),
    )
    return token
  }
}
```

Se o ESLint reclamar de `_hash` não usado, siga o padrão já usado no repositório para descartar propriedades (procure `no-unused-vars` em `eslint.config.js`); alternativa: uma função `withoutHash(stored)` que monta o objeto campo a campo.

- [ ] **Passo 3: rodar**

Run: `npx vitest run server/domains/accounts`
Esperado: PASS.

- [ ] **Passo 4: commit**

```bash
git add server/domains/accounts/account-service*
git commit -m "feat(accounts): serviço de conta de cliente"
```

---

### Tarefa 7: Rotas `/api/v1/account/*` e montagem no app

**Arquivos:**

- Criar: `server/http/customer-session.ts`, `server/http/account-routes.ts`
- Modificar: `server/app.ts` (cookie no escopo raiz, montagem dos serviços), `server/http/admin-routes.ts` (remover `scope.register(cookie)`)
- Teste: `server/http/account-routes.test.ts`

**Interfaces:**

- Consome: `AccountService` (tarefa 6).
- Produz (`customer-session.ts`): `CUSTOMER_SESSION_COOKIE = 'customer_session'`; `customerCookieOptions(env)`; `assertAllowedOrigin(request, env)` (403 `FORBIDDEN_ORIGIN`); `requireCustomer(request, accounts): CustomerSession` (401 `UNAUTHENTICATED`).
- Produz (`app.ts`): `AppOptions` ganha `mail?: MailGateway`; `buildApp` cria `AccountService` e o passa a `registerAccountRoutes` e `registerRoutes`.

- [ ] **Passo 1: testes de rota (falhando)**

`server/http/account-routes.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { parseServerEnv } from '../config/env.js'

const env = parseServerEnv({
  DATABASE_PATH: ':memory:',
  TICKET_PROVIDER: 'mock',
  PAYMENT_PROVIDER: 'mock',
})
const apps: Awaited<ReturnType<typeof buildApp>>[] = []
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

async function createApp() {
  const app = await buildApp({ env, logger: false, startWorker: false })
  apps.push(app)
  return app
}

type App = Awaited<ReturnType<typeof createApp>>

export async function loginAsMaria(app: App) {
  await app.inject({
    method: 'POST',
    url: '/api/v1/account/codes',
    payload: { purpose: 'first_access', cpf: '52998224725' },
  })
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/account/password',
    payload: { cpf: '52998224725', code: '000000', password: 'senha-maria-1' },
  })
  const cookie = response.cookies.find((item) => item.name === 'customer_session')
  if (!cookie) throw new Error('sem cookie de sessão')
  return { customer_session: cookie.value }
}

describe('rotas de conta', () => {
  it('identifica CPF sem revelar dados além do e-mail mascarado', async () => {
    const app = await createApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/account/identify',
      payload: { cpf: '52998224725' },
    })
    expect(response.json()).toEqual({ status: 'first_access', maskedEmail: 'ma***@example.com' })
    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('primeiro acesso cria sessão em cookie HttpOnly e /me devolve a conta', async () => {
    const app = await createApp()
    const cookies = await loginAsMaria(app)
    const me = await app.inject({ method: 'GET', url: '/api/v1/account/me', cookies })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({
      account: { cpf: '52998224725', name: 'Maria da Silva', complete: true },
    })
  })

  it('cookie de sessão é HttpOnly e SameSite=Strict', async () => {
    const app = await createApp()
    await app.inject({
      method: 'POST',
      url: '/api/v1/account/codes',
      payload: { purpose: 'first_access', cpf: '52998224725' },
    })
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/account/password',
      payload: { cpf: '52998224725', code: '000000', password: 'senha-maria-1' },
    })
    const cookie = response.cookies.find((item) => item.name === 'customer_session')
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api' })
  })

  it('login errado responde 401 genérico e trava após 5 falhas do mesmo CPF', async () => {
    const app = await createApp()
    await loginAsMaria(app)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/account/login',
        payload: { cpf: '52998224725', password: 'errada-123' },
      })
      expect(response.statusCode).toBe(401)
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/v1/account/login',
      payload: { cpf: '52998224725', password: 'senha-maria-1' },
    })
    expect(blocked.statusCode).toBe(429)
  })

  it('recusa escrita de outra origem', async () => {
    const app = await createApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/account/identify',
      headers: { origin: 'https://malicioso.example' },
      payload: { cpf: '52998224725' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('logout apaga a sessão', async () => {
    const app = await createApp()
    const cookies = await loginAsMaria(app)
    await app.inject({ method: 'POST', url: '/api/v1/account/logout', cookies })
    const me = await app.inject({ method: 'GET', url: '/api/v1/account/me', cookies })
    expect(me.statusCode).toBe(401)
  })
})
```

Run: `npx vitest run server/http/account-routes.test.ts`
Esperado: FAIL (404).

- [ ] **Passo 2: `customer-session.ts`**

```ts
import type { FastifyRequest } from 'fastify'
import type { ServerEnv } from '../config/env.js'
import type { AccountService, CustomerSession } from '../domains/accounts/account-service.js'
import { DomainError } from '../shared/errors.js'

export const CUSTOMER_SESSION_COOKIE = 'customer_session'
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function customerCookieOptions(env: ServerEnv) {
  return {
    path: '/api',
    httpOnly: true,
    sameSite: 'strict',
    secure: new URL(env.PUBLIC_APP_URL).protocol === 'https:',
  } as const
}

// SameSite=Strict já barra CSRF em navegadores atuais; Origin cobre os demais.
export function assertAllowedOrigin(request: FastifyRequest, env: ServerEnv) {
  const origin = request.headers.origin
  if (
    WRITE_METHODS.has(request.method) &&
    origin &&
    origin !== new URL(env.PUBLIC_APP_URL).origin
  ) {
    throw new DomainError('Origem não permitida.', 403, 'FORBIDDEN_ORIGIN')
  }
}

export function requireCustomer(
  request: FastifyRequest,
  accounts: AccountService,
): CustomerSession {
  const session = accounts.authenticate(request.cookies[CUSTOMER_SESSION_COOKIE])
  if (!session) throw new DomainError('Entre na sua conta para continuar.', 401, 'UNAUTHENTICATED')
  return session
}
```

- [ ] **Passo 3: `account-routes.ts`**

```ts
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { ServerEnv } from '../config/env.js'
import type { AccountService } from '../domains/accounts/account-service.js'
import {
  identifyInputSchema,
  loginInputSchema,
  registerInputSchema,
  requestCodeInputSchema,
  setPasswordInputSchema,
  updateProfileInputSchema,
} from '../domains/accounts/account-types.js'
import {
  CUSTOMER_SESSION_COOKIE,
  assertAllowedOrigin,
  customerCookieOptions,
  requireCustomer,
} from './customer-session.js'
import { createFailureLimiter, createRateLimiter } from './rate-limit.js'

const PREFIX = '/api/v1/account'

export async function registerAccountRoutes(
  app: FastifyInstance,
  env: ServerEnv,
  accounts: AccountService,
) {
  const cookieOptions = customerCookieOptions(env)
  const limitIdentify = createRateLimiter(10, 60_000)
  const limitCodes = createRateLimiter(5, 60_000)
  const loginFailuresByIp = createFailureLimiter(10, 60_000)
  const loginFailuresByCpf = createFailureLimiter(5, 15 * 60_000)
  const codeFailuresByIp = createFailureLimiter(10, 60_000)

  function startSession(reply: FastifyReply, token: string) {
    // Cookie de sessão do navegador; a validade real é controlada no servidor.
    reply.setCookie(CUSTOMER_SESSION_COOKIE, token, cookieOptions)
  }

  await app.register(async (scope) => {
    scope.addHook('onRequest', async (request) => assertAllowedOrigin(request, env))
    scope.addHook('onSend', async (_request, reply) => {
      reply.header('Cache-Control', 'no-store')
    })

    scope.post(`${PREFIX}/identify`, async (request) => {
      limitIdentify(request.ip)
      const { cpf } = identifyInputSchema.parse(request.body)
      return accounts.identify(cpf)
    })

    scope.post(`${PREFIX}/codes`, async (request, reply) => {
      limitCodes(request.ip)
      await accounts.requestCode(requestCodeInputSchema.parse(request.body))
      return reply.status(202).send()
    })

    scope.post(`${PREFIX}/login`, async (request, reply) => {
      const input = loginInputSchema.parse(request.body)
      loginFailuresByIp.assertAllowed(request.ip)
      loginFailuresByCpf.assertAllowed(input.cpf)
      const { token, account } = await accounts
        .login(input.cpf, input.password)
        .catch((error: unknown) => {
          loginFailuresByIp.recordFailure(request.ip)
          loginFailuresByCpf.recordFailure(input.cpf)
          throw error
        })
      startSession(reply, token)
      return { account: accounts.toPublic(account) }
    })

    scope.post(`${PREFIX}/register`, async (request, reply) => {
      codeFailuresByIp.assertAllowed(request.ip)
      const input = registerInputSchema.parse(request.body)
      const { token, account } = await accounts.register(input).catch((error: unknown) => {
        codeFailuresByIp.recordFailure(request.ip)
        throw error
      })
      startSession(reply, token)
      return reply.status(201).send({ account: accounts.toPublic(account) })
    })

    scope.post(`${PREFIX}/password`, async (request, reply) => {
      codeFailuresByIp.assertAllowed(request.ip)
      const input = setPasswordInputSchema.parse(request.body)
      const { token, account } = await accounts.setPassword(input).catch((error: unknown) => {
        codeFailuresByIp.recordFailure(request.ip)
        throw error
      })
      startSession(reply, token)
      return { account: accounts.toPublic(account) }
    })

    scope.get(`${PREFIX}/me`, async (request) => {
      const session = requireCustomer(request, accounts)
      return { account: accounts.toPublic(session.account) }
    })

    scope.put(`${PREFIX}/profile`, async (request) => {
      const session = requireCustomer(request, accounts)
      const account = await accounts.updateProfile(
        session,
        updateProfileInputSchema.parse(request.body),
      )
      return { account: accounts.toPublic(account) }
    })

    scope.post(`${PREFIX}/logout`, async (request, reply) => {
      const session = accounts.authenticate(request.cookies[CUSTOMER_SESSION_COOKIE])
      if (session) accounts.logout(session)
      reply.clearCookie(CUSTOMER_SESSION_COOKIE, cookieOptions)
      return reply.status(204).send()
    })
  })
}
```

Observação: `createFailureLimiter` devolve a mensagem "Muitas tentativas de login"; serve também para código. Não mude a mensagem existente.

- [ ] **Passo 4: montar no app**

Em `server/app.ts`:

1. `import cookie from '@fastify/cookie'` e `await app.register(cookie)` logo após `cors`. Em `server/http/admin-routes.ts`, remover `await scope.register(cookie)` e o import (o plugin no escopo raiz já decora todos os escopos).
2. Criar os serviços após `customerGateway`:

```ts
const accountRepository = new AccountRepository(database)
const mail =
  options.mail ?? (env.MAIL_PROVIDER === 'smtp' ? new SmtpMailGateway(env) : new MockMailGateway())
// Em mock o código é fixo para permitir testes e E2E sem caixa de e-mail.
const verification = new VerificationService(
  accountRepository,
  mail,
  now,
  env.MAIL_PROVIDER === 'mock' ? () => '000000' : undefined,
)
const accounts = new AccountService(accountRepository, customerGateway, verification, now)
```

3. `await registerAccountRoutes(app, env, accounts)` junto das demais rotas; `AppOptions` ganha `mail?: MailGateway`.
4. Se `env.MAIL_PROVIDER === 'mock' && env.PAYMENT_PROVIDER === 'infinitepay'`, `app.log.warn('MAIL_PROVIDER=mock com pagamento real: o código de verificação é sempre 000000.')`.

- [ ] **Passo 5: rodar**

Run: `npx vitest run server`
Esperado: PASS (inclui testes do admin, que dependem do cookie agora registrado na raiz).

- [ ] **Passo 6: commit**

```bash
git add server
git commit -m "feat(accounts): rotas de login, cadastro e sessão de cliente"
```

---

### Tarefa 8: Pedidos pela sessão e remoção das consultas por CPF

**Arquivos:**

- Modificar: `server/http/routes.ts`, `server/http/order-presenter.ts` (só o comentário de `presentPurchase`), `server/app.ts` (passar `accounts` e `env` para `registerRoutes`)
- Remover: `server/http/purchase-lookup-routes.test.ts` (substituído), rota `GET /api/v1/customers/lookup` e `CustomerService.lookup` se ficar sem uso
- Modificar testes: `server/http/live-http-routes.test.ts`, `admin-dashboard-routes.test.ts`, `admin-sales-routes.test.ts`
- Criar: `server/http/test-session.ts` (helper de teste), `server/http/order-routes.test.ts`

**Interfaces:**

- Consome: `requireCustomer`, `assertAllowedOrigin` (tarefa 7), `AccountService`.
- Produz: `POST /api/v1/orders` com corpo `{ raffleId, selection } | { raffles }` + `beneficiaryName?` + `email?` (qualquer `customer` enviado é ignorado); `GET /api/v1/orders/mine` → `{ orders }`.
- Produz (`test-session.ts`): `loginAsMaria(app): Promise<Record<string, string>>` (cookies para `app.inject`).

- [ ] **Passo 1: helper de teste**

Mova `loginAsMaria` de `account-routes.test.ts` para `server/http/test-session.ts` (exportada; arquivo não termina em `.test.ts`, então inclua `import type { FastifyInstance } from 'fastify'` e tipe o parâmetro como `FastifyInstance`) e importe-o nos testes.

- [ ] **Passo 2: testes de pedido (falhando)**

`server/http/order-routes.test.ts` (mesmo `createApp` dos outros testes de rota):

```ts
it('exige sessão para criar pedido', async () => {
  const app = await createApp()
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    payload: { raffleId: 'sorteio-setembro', selection: { mode: 'manual', cardIds: ['card-001'] } },
  })
  expect(response.statusCode).toBe(401)
})

it('usa o comprador da sessão e ignora customer enviado pelo navegador', async () => {
  const app = await createApp()
  const cookies = await loginAsMaria(app)
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    cookies,
    payload: {
      raffleId: 'sorteio-setembro',
      selection: { mode: 'manual', cardIds: ['card-001'] },
      beneficiaryName: 'João Terceiro',
      customer: { name: 'Intruso', cpf: '11144477735', phone: '84999990000' },
    },
  })
  expect(created.statusCode).toBe(201)
  const mine = await app.inject({ method: 'GET', url: '/api/v1/orders/mine', cookies })
  expect(mine.json<{ orders: Array<{ id: string }> }>().orders.map((order) => order.id)).toEqual([
    created.json<{ id: string }>().id,
  ])
})

it('Minhas compras exige sessão', async () => {
  const app = await createApp()
  expect((await app.inject({ method: 'GET', url: '/api/v1/orders/mine' })).statusCode).toBe(401)
})

it('rotas de consulta por CPF não existem mais', async () => {
  const app = await createApp()
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/orders/lookup',
        payload: { cpf: '52998224725' },
      })
    ).statusCode,
  ).toBe(404)
  expect(
    (await app.inject({ method: 'GET', url: '/api/v1/customers/lookup?cpf=52998224725' }))
      .statusCode,
  ).toBe(404)
})
```

Leve para este arquivo os casos de `purchase-lookup-routes.test.ts` que validam o conteúdo de "Minhas compras" (pedido pago com dados do comprovante; pendente com `checkoutUrl`; sem dados pessoais fora de `paid`), trocando a consulta por `GET /api/v1/orders/mine` com `cookies`. Depois apague `purchase-lookup-routes.test.ts` e o teste de `createRateLimiter` que estava nele, movendo-o para `server/http/rate-limit.test.ts` se não existir lá.

Run: `npx vitest run server/http/order-routes.test.ts`
Esperado: FAIL.

- [ ] **Passo 3: rotas**

Em `server/http/routes.ts`: assinatura `registerRoutes(app, env, service, accounts, settings)`; remover `customerLookupQuerySchema`, `purchaseLookupBodySchema`, as duas rotas de consulta e o import de `CustomerService`; adicionar:

```ts
// Só opções do pedido vêm do navegador; o comprador é sempre o dono da sessão.
const orderOptionsSchema = z
  .object({
    beneficiaryName: z.string().trim().min(3).max(120).optional(),
    email: z.string().trim().toLowerCase().max(160).pipe(z.email()).optional(),
  })
  .passthrough()

app.get('/api/v1/orders/mine', async (request, reply) => {
  const { account } = requireCustomer(request, accounts)
  reply.header('Cache-Control', 'no-store')
  return { orders: service.listOrdersByCpf(account.cpf).map(presentPurchase) }
})

app.post('/api/v1/orders', async (request, reply) => {
  assertAllowedOrigin(request, env)
  const { account } = requireCustomer(request, accounts)
  if (!isProfileComplete(account)) {
    throw new DomainError(
      'Complete seu cadastro em Meus dados antes de comprar.',
      400,
      'PROFILE_INCOMPLETE',
    )
  }
  const { beneficiaryName, email, ...selection } = orderOptionsSchema.parse(request.body)
  const order = await service.createOrder(
    createOrderInputSchema.parse({
      ...selection,
      customer: {
        name: account.name,
        cpf: account.cpf,
        phone: account.phone,
        email: email ?? account.email ?? undefined,
        address: account.address,
        beneficiaryName,
      },
    }),
  )
  return reply.status(201).send(presentOrder(order))
})
```

A rota `/orders/mine` deve ser registrada antes de `/orders/:id` só por legibilidade (o Fastify já prioriza rota estática). `GET /api/v1/orders/:id` não muda: `presentOrder` não tem dados pessoais.

Atualize o comentário de `presentPurchase` em `order-presenter.ts`: "Só pedido pago traz dados pessoais e do comprovante; a rota exige a sessão do dono."

Se `CustomerService.lookup` e `CustomerLookupCriteria`/`CustomerLookupResult` ficarem sem uso, remova-os e seus testes.

- [ ] **Passo 4: atualizar testes de rota existentes**

Em `live-http-routes.test.ts`, `admin-dashboard-routes.test.ts` e `admin-sales-routes.test.ts`, toda criação de pedido por `app.inject` passa `cookies: await loginAsMaria(app)` e deixa de mandar `customer` (troque `customer.beneficiaryName` por `beneficiaryName` no corpo). Onde o teste dependia de cliente novo (CPF fora do mock), cadastre antes por `POST /api/v1/account/codes` + `/register` com código `000000`. Em `live-http-routes.test.ts`, o caso de `customers/lookup` é removido; mantenha os de pedido e ajuste o gateway simulado para responder `/pessoa/cpf/{cpf}` (usado pelo `identify`/`setPassword`) e `/pessoa/cadastro`.

`server/domains/orders/order-service.test.ts` não muda: o serviço continua recebendo `customer`.

- [ ] **Passo 5: rodar tudo do backend**

Run: `npx vitest run server`
Esperado: PASS.

- [ ] **Passo 6: commit**

```bash
git add -A server
git commit -m "feat(orders): pedido e Minhas compras pela sessão do cliente"
```

---

### Tarefa 9: Código de primeiro acesso pelo admin (backend)

**Arquivos:**

- Criar: `server/domains/admin/admin-customer-access-service.ts`
- Modificar: `server/http/admin-routes.ts` (`AdminServices.customerAccess`, nova rota), `server/app.ts`
- Teste: `server/http/admin-routes.test.ts` (ou `admin-customer-access.test.ts` no mesmo padrão)

**Interfaces:**

- Consome: `AccountService.issueAdminCode` (tarefa 6), `AdminRepository.recordAudit`, `AdminSession`.
- Produz: `AdminCustomerAccessService(adminRepository, accounts, now).issue(session: AdminSession, cpf: string): Promise<{ code: string; expiresAt: string }>`; rota `POST /api/v1/admin/customers/:cpf/access-code` → `{ code, expiresAt }`.

- [ ] **Passo 1: teste (falhando)**

Usando o login de admin já existente nos testes do admin (`ADMIN_BOOTSTRAP_LOGIN`/`PASSWORD` no env do teste):

```ts
it('gera código de acesso de cliente e registra auditoria', async () => {
  const app = await createAdminApp()
  const cookies = await adminLogin(app)
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/customers/52998224725/access-code',
    cookies,
  })
  expect(response.statusCode).toBe(200)
  expect(response.json()).toMatchObject({ code: expect.stringMatching(/^\d{6}$/) })

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/account/password',
    payload: {
      cpf: '52998224725',
      code: response.json<{ code: string }>().code,
      password: 'senha-maria-1',
    },
  })
  expect(login.statusCode).toBe(200)
})

it('código de acesso exige admin', async () => {
  const app = await createAdminApp()
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/customers/52998224725/access-code',
  })
  expect(response.statusCode).toBe(401)
})
```

(`createAdminApp`/`adminLogin`: use os helpers existentes em `admin-routes.test.ts`; se não forem exportados, replique o padrão local do arquivo.)

Run: `npx vitest run server/http/admin-routes.test.ts`
Esperado: FAIL.

- [ ] **Passo 2: implementar**

```ts
import type { AccountService } from '../accounts/account-service.js'
import { ADMIN_CODE_TTL_MS } from '../accounts/verification-service.js'
import type { AdminSession } from './admin-auth-service.js'
import type { AdminRepository } from './admin-repository.js'

// Para cliente sem e-mail no cadastro: o admin entrega o código pessoalmente ou por WhatsApp.
export class AdminCustomerAccessService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly accounts: AccountService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async issue(session: AdminSession, cpf: string) {
    const code = await this.accounts.issueAdminCode(cpf, session.user.id)
    const current = this.now()
    this.repository.recordAudit({
      userId: session.user.id,
      action: 'customer.access_code',
      targetId: cpf,
      createdAt: current.toISOString(),
    })
    return { code, expiresAt: new Date(current.getTime() + ADMIN_CODE_TTL_MS).toISOString() }
  }
}
```

Em `admin-routes.ts`, dentro de `protectedScope`:

```ts
protectedScope.post(`${ADMIN_PREFIX}/customers/:cpf/access-code`, async (request) => {
  const { cpf } = z.object({ cpf: z.string().regex(/^\d{11}$/) }).parse(request.params)
  return services.customerAccess.issue(requireAdminSession(request), cpf)
})
```

Adicionar `customerAccess: AdminCustomerAccessService` em `AdminServices` e montar em `app.ts` com `new AdminCustomerAccessService(adminRepository, accounts, now)`.

- [ ] **Passo 3: rodar e commit**

Run: `npx vitest run server`
Esperado: PASS.

```bash
git add server
git commit -m "feat(admin): código de primeiro acesso para cliente sem e-mail"
```

---

### Tarefa 10: Feature `account` no frontend (domain, api, repository, service, runtime)

**Arquivos:**

- Criar: `src/features/account/domain/types.ts`, `api/schemas.ts`, `repository/account-repository.ts`, `service/account-forms.ts`, `service/account-redirect.ts`, `runtime/account-queries.ts`
- Modificar: `src/shared/config/api-routes.ts`, `src/app/App.tsx` (401 da conta zera a sessão no cache)
- Teste: `src/features/account/service/account-forms.test.ts`, `src/features/account/service/account-redirect.test.ts`

**Interfaces:**

- Produz (`domain/types.ts`):

```ts
export type Address = {
  zipCode: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
}
export type Account = {
  cpf: string
  name: string
  email: string | null
  phone: string
  address?: Address
  complete: boolean
}
export type IdentifyResult =
  | { status: 'account' }
  | { status: 'first_access'; maskedEmail: string }
  | { status: 'no_email' }
  | { status: 'new' }
export type Profile = { name: string; cpf: string; phone: string; email: string; address: Address }
export type CodeRequest =
  | { purpose: 'signup'; cpf: string; email: string }
  | { purpose: 'first_access' | 'reset'; cpf: string }
export interface AccountRepository {
  getMe(signal?: AbortSignal): Promise<Account | null>
  identify(cpf: string): Promise<IdentifyResult>
  requestCode(request: CodeRequest): Promise<void>
  login(cpf: string, password: string): Promise<Account>
  register(input: { customer: Profile; password: string; code: string }): Promise<Account>
  setPassword(input: {
    cpf: string
    code: string
    password: string
    email?: string
  }): Promise<Account>
  updateProfile(input: {
    customer: Omit<Profile, 'cpf'>
    currentPassword: string
  }): Promise<Account>
  logout(): Promise<void>
}
```

- Produz (`runtime/account-queries.ts`): `accountKeys = { all: ['account'], me: ['account', 'me'] }`; `handleAccountUnauthenticated(queryClient, error, queryKey)`; hooks `useAccount()`, `useIdentify()`, `useRequestCode()`, `useLogin()`, `useRegister()`, `useSetPassword()`, `useUpdateProfile()`, `useLogout()` (mutações que autenticam gravam a conta em `accountKeys.me`; logout grava `null` e remove `['purchases']`).
- Produz (`service/account-forms.ts`): `addressSchema` (movido de `checkout/service/customer-schema.ts`), `cpfFormSchema`, `passwordFormSchema`, `signupFormSchema`, `newPasswordFormSchema`, `profileFormSchema`, `toProfile(form)`.
- Produz (`service/account-redirect.ts`): `safeAccountRedirect(next: string | null): string`.
- Produz (`api-routes.ts`): `accountIdentify`, `accountCodes`, `accountLogin`, `accountRegister`, `accountPassword`, `accountMe`, `accountProfile`, `accountLogout`, `myOrders`.

- [ ] **Passo 1: testes de serviço (falhando)**

`account-redirect.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { safeAccountRedirect } from './account-redirect'

describe('safeAccountRedirect', () => {
  it('aceita só caminhos internos fora do admin e do login', () => {
    expect(safeAccountRedirect('/carrinho')).toBe('/carrinho')
    expect(safeAccountRedirect('/minhas-compras')).toBe('/minhas-compras')
    expect(safeAccountRedirect('https://malicioso.example')).toBe('/')
    expect(safeAccountRedirect('//malicioso.example')).toBe('/')
    expect(safeAccountRedirect('/admin')).toBe('/')
    expect(safeAccountRedirect('/entrar')).toBe('/')
    expect(safeAccountRedirect(null)).toBe('/')
  })
})
```

`account-forms.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { newPasswordFormSchema, signupFormSchema } from './account-forms'

const signup = {
  name: 'Cliente Novo',
  cpf: '111.444.777-35',
  phone: '(84) 99999-8888',
  email: 'Novo@Example.com',
  address: {
    zipCode: '59062-300',
    street: 'av lima',
    number: '1',
    complement: '',
    neighborhood: 'nazare',
    city: 'natal',
    state: 'rn',
  },
  password: 'senha-nova-1',
  confirmPassword: 'senha-nova-1',
}

describe('formulários de conta', () => {
  it('normaliza cadastro', () => {
    const parsed = signupFormSchema.parse(signup)
    expect(parsed.email).toBe('novo@example.com')
    expect(parsed.address.state).toBe('RN')
  })

  it('exige confirmação igual e senha com 8 caracteres', () => {
    expect(signupFormSchema.safeParse({ ...signup, confirmPassword: 'outra-123' }).success).toBe(
      false,
    )
    expect(
      newPasswordFormSchema.safeParse({
        code: '000000',
        password: '1234567',
        confirmPassword: '1234567',
      }).success,
    ).toBe(false)
  })
})
```

Run: `npx vitest run src/features/account`
Esperado: FAIL.

- [ ] **Passo 2: implementar `service/`**

`account-redirect.ts`:

```ts
// Só destinos internos do site público, evitando redirecionamento aberto.
export function safeAccountRedirect(next: string | null) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  if (/^\/(admin|entrar)(\/|\?|$)/.test(next)) return '/'
  return next
}
```

`account-forms.ts` (mova `addressSchema` e `upperText` de `src/features/checkout/service/customer-schema.ts` para cá, sem alterar):

```ts
import { z } from 'zod'
import { isValidCpf, onlyDigits } from '../../../shared/lib/forms'
import type { Profile } from '../domain/types'

// addressSchema e upperText movidos de checkout/service/customer-schema.ts.

const passwordField = z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.').max(128)
const emailField = z.string().trim().toLowerCase().pipe(z.email('Informe um email valido.'))
const phoneField = z
  .string()
  .refine((value) => [10, 11].includes(onlyDigits(value).length), 'Informe um celular com DDD.')

function confirmMatches<T extends { password: string; confirmPassword: string }>(
  value: T,
  context: z.RefinementCtx,
) {
  if (value.password !== value.confirmPassword) {
    context.addIssue({
      code: 'custom',
      path: ['confirmPassword'],
      message: 'As senhas não conferem.',
    })
  }
}

export const cpfFormSchema = z.object({
  cpf: z.string().refine(isValidCpf, 'Informe um CPF valido.'),
})
export const passwordFormSchema = z.object({ password: z.string().min(1, 'Informe sua senha.') })
export const codeField = z.string().regex(/^\d{6}$/, 'Informe o código de 6 dígitos.')

const profileFields = {
  name: z.string().trim().min(3, 'Informe seu nome completo.'),
  phone: phoneField,
  email: emailField,
  address: addressSchema,
}

export const signupFormSchema = z
  .object({
    ...profileFields,
    cpf: cpfFormSchema.shape.cpf,
    password: passwordField,
    confirmPassword: z.string(),
  })
  .superRefine(confirmMatches)

export const newPasswordFormSchema = z
  .object({ code: codeField, password: passwordField, confirmPassword: z.string() })
  .superRefine(confirmMatches)

export const profileFormSchema = z.object({
  ...profileFields,
  currentPassword: z.string().min(1, 'Informe sua senha atual para salvar.'),
})

export type SignupForm = z.input<typeof signupFormSchema>
export type SignupFormOutput = z.output<typeof signupFormSchema>
export type NewPasswordForm = z.input<typeof newPasswordFormSchema>
export type ProfileForm = z.input<typeof profileFormSchema>
export type ProfileFormOutput = z.output<typeof profileFormSchema>

export function toProfile(form: SignupFormOutput): Profile {
  return {
    name: form.name,
    cpf: onlyDigits(form.cpf),
    phone: onlyDigits(form.phone),
    email: form.email,
    address: form.address,
  }
}
```

Em `checkout/service/customer-schema.ts`, troque a definição local de `addressSchema` por `import { addressSchema } from '../../account/service/account-forms'` até a tarefa 12, que simplifica o arquivo.

- [ ] **Passo 3: `api/schemas.ts`**

```ts
import { z } from 'zod'

export const addressSchema = z.object({
  zipCode: z.string(),
  street: z.string(),
  number: z.string(),
  complement: z.string().optional(),
  neighborhood: z.string(),
  city: z.string(),
  state: z.string(),
})

export const accountSchema = z.object({
  cpf: z.string().regex(/^\d{11}$/),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string(),
  address: addressSchema.optional(),
  complete: z.boolean(),
})

export const accountResponseSchema = z.object({ account: accountSchema })

export const identifyResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('account') }),
  z.object({ status: z.literal('first_access'), maskedEmail: z.string() }),
  z.object({ status: z.literal('no_email') }),
  z.object({ status: z.literal('new') }),
])

export const noContentSchema = z.undefined()
```

- [ ] **Passo 4: rotas e repository**

`api-routes.ts`: adicione as rotas abaixo. `customerLookup` sai na tarefa 12 e `purchaseLookup` na tarefa 13, junto com quem as usa, para o build não quebrar entre tarefas.

```ts
accountIdentify: '/v1/account/identify',
accountCodes: '/v1/account/codes',
accountLogin: '/v1/account/login',
accountRegister: '/v1/account/register',
accountPassword: '/v1/account/password',
accountMe: '/v1/account/me',
accountProfile: '/v1/account/profile',
accountLogout: '/v1/account/logout',
myOrders: '/v1/orders/mine',
```

`repository/account-repository.ts`:

```ts
import { ApiError, requestJson } from '../../../shared/api/http-client'
import { apiRoutes } from '../../../shared/config/api-routes'
import { env } from '../../../shared/config/env'
import { accountResponseSchema, identifyResultSchema, noContentSchema } from '../api/schemas'
import type { Account, AccountRepository } from '../domain/types'

const liveRepository: AccountRepository = {
  async getMe(signal) {
    try {
      const response = await requestJson(apiRoutes.accountMe, accountResponseSchema, { signal })
      return response.account
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  },
  identify: (cpf) =>
    requestJson(apiRoutes.accountIdentify, identifyResultSchema, { method: 'POST', body: { cpf } }),
  async requestCode(request) {
    await requestJson(apiRoutes.accountCodes, noContentSchema, { method: 'POST', body: request })
  },
  login: async (cpf, password) =>
    (
      await requestJson(apiRoutes.accountLogin, accountResponseSchema, {
        method: 'POST',
        body: { cpf, password },
      })
    ).account,
  register: async (input) =>
    (
      await requestJson(apiRoutes.accountRegister, accountResponseSchema, {
        method: 'POST',
        body: input,
      })
    ).account,
  setPassword: async (input) =>
    (
      await requestJson(apiRoutes.accountPassword, accountResponseSchema, {
        method: 'POST',
        body: input,
      })
    ).account,
  updateProfile: async (input) =>
    (
      await requestJson(apiRoutes.accountProfile, accountResponseSchema, {
        method: 'PUT',
        body: input,
      })
    ).account,
  async logout() {
    await requestJson(apiRoutes.accountLogout, noContentSchema, { method: 'POST' })
  },
}

// Demonstração sem backend: sessão só em memória (some ao recarregar) e código 000000.
const mockMaria: Account = {
  cpf: '52998224725',
  name: 'Maria da Silva',
  email: 'maria@example.com',
  phone: '84999855367',
  address: {
    zipCode: '59062300',
    street: 'AVENIDA LIMA E SILVA',
    number: '129',
    neighborhood: 'NAZARE',
    city: 'NATAL',
    state: 'RN',
  },
  complete: true,
}
let mockSession: Account | null = null

function mockDelay() {
  return new Promise((resolve) => window.setTimeout(resolve, 250))
}

function assertMockCode(code: string) {
  if (code !== '000000')
    throw new ApiError('Código inválido ou expirado. Peça um novo código.', 400, 'INVALID_CODE')
}

const mockRepository: AccountRepository = {
  async getMe() {
    return mockSession ? structuredClone(mockSession) : null
  },
  async identify(cpf) {
    await mockDelay()
    return cpf === mockMaria.cpf ? { status: 'account' } : { status: 'new' }
  },
  async requestCode() {
    await mockDelay()
  },
  async login(cpf, password) {
    await mockDelay()
    if (cpf !== mockMaria.cpf || password.length < 8) {
      throw new ApiError('CPF ou senha inválidos.', 401, 'INVALID_CREDENTIALS')
    }
    mockSession = structuredClone(mockMaria)
    return structuredClone(mockSession)
  },
  async register({ customer, code }) {
    await mockDelay()
    assertMockCode(code)
    mockSession = { ...customer, complete: true }
    return structuredClone(mockSession)
  },
  async setPassword({ code }) {
    await mockDelay()
    assertMockCode(code)
    mockSession = structuredClone(mockMaria)
    return structuredClone(mockSession)
  },
  async updateProfile({ customer }) {
    await mockDelay()
    if (!mockSession)
      throw new ApiError('Entre na sua conta para continuar.', 401, 'UNAUTHENTICATED')
    mockSession = { ...mockSession, ...customer, complete: true }
    return structuredClone(mockSession)
  },
  async logout() {
    mockSession = null
  },
}

export const accountRepository = env.VITE_API_MODE === 'live' ? liveRepository : mockRepository
```

- [ ] **Passo 5: runtime**

`runtime/account-queries.ts`:

```ts
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../shared/api/http-client'
import type { Account, AccountRepository, CodeRequest, Profile } from '../domain/types'
import { accountRepository } from '../repository/account-repository'

export const accountKeys = { all: ['account'] as const, me: ['account', 'me'] as const }

// 401 em qualquer chamada que exige sessão (conta ou Minhas compras) derruba a sessão local.
export function handleAccountUnauthenticated(
  queryClient: QueryClient,
  error: unknown,
  queryKey: readonly unknown[] | undefined,
) {
  if (!(error instanceof ApiError) || error.status !== 401) return
  if (queryKey?.[0] !== accountKeys.all[0] && queryKey?.[0] !== 'purchases') return
  queryClient.setQueryData(accountKeys.me, null)
}

export function createAccountHooks(repository: AccountRepository) {
  function useSignedIn() {
    const queryClient = useQueryClient()
    return (account: Account) => queryClient.setQueryData(accountKeys.me, account)
  }

  return {
    useAccount() {
      return useQuery({
        queryKey: accountKeys.me,
        queryFn: ({ signal }) => repository.getMe(signal),
        retry: false,
        staleTime: 60_000,
      })
    },
    useIdentify() {
      return useMutation({ mutationFn: (cpf: string) => repository.identify(cpf) })
    },
    useRequestCode() {
      return useMutation({ mutationFn: (request: CodeRequest) => repository.requestCode(request) })
    },
    useLogin() {
      const signedIn = useSignedIn()
      return useMutation({
        mutationFn: ({ cpf, password }: { cpf: string; password: string }) =>
          repository.login(cpf, password),
        onSuccess: signedIn,
      })
    },
    useRegister() {
      const signedIn = useSignedIn()
      return useMutation({
        mutationFn: (input: { customer: Profile; password: string; code: string }) =>
          repository.register(input),
        onSuccess: signedIn,
      })
    },
    useSetPassword() {
      const signedIn = useSignedIn()
      return useMutation({
        mutationFn: (input: { cpf: string; code: string; password: string; email?: string }) =>
          repository.setPassword(input),
        onSuccess: signedIn,
      })
    },
    useUpdateProfile() {
      const signedIn = useSignedIn()
      return useMutation({
        mutationKey: accountKeys.all,
        mutationFn: (input: { customer: Omit<Profile, 'cpf'>; currentPassword: string }) =>
          repository.updateProfile(input),
        onSuccess: signedIn,
      })
    },
    useLogout() {
      const queryClient = useQueryClient()
      return useMutation({
        mutationFn: () => repository.logout(),
        onSuccess: () => {
          queryClient.setQueryData(accountKeys.me, null)
          queryClient.removeQueries({ queryKey: ['purchases'] })
        },
      })
    },
  }
}

export const {
  useAccount,
  useIdentify,
  useRequestCode,
  useLogin,
  useRegister,
  useSetPassword,
  useUpdateProfile,
  useLogout,
} = createAccountHooks(accountRepository)
```

Em `src/app/App.tsx`, nos dois `onError` dos caches, chamar também `handleAccountUnauthenticated(queryClient, error, key)` ao lado de `handleAdminUnauthenticated`.

- [ ] **Passo 6: rodar e commit**

Run: `npx vitest run src/features/account && npm run validate:architecture && npx tsc -b`
Esperado: PASS.

```bash
git add src
git commit -m "feat(account): feature de conta no frontend"
```

---

### Tarefa 11: `AuthFlow` e `AddressFields`

**Arquivos:**

- Criar: `src/features/account/ui/AuthFlow.tsx`, `src/features/account/ui/AddressFields.tsx`, `src/features/account/ui/CodeStep.tsx`
- Teste: `src/features/account/ui/AuthFlow.test.tsx`
- Modificar: `src/app/styles.css` (estilos mínimos reaproveitando `.surface`, `.field`, `.form-row`, `.button`)

**Interfaces:**

- Consome: hooks da tarefa 10; `formatCpf`, `formatPhone`, `onlyDigits` de `shared/lib/forms`.
- Produz: `<AuthFlow onAuthenticated={(account: Account) => void} title?: string />`; `<AddressFields register errors />` genérico para formulários com campo `address` (tipo `UseFormRegister<{ address: AddressForm }>` — se o TypeScript não aceitar formulários com mais campos, receba `register` já prefixado por uma função `fieldProps(name)`; mantenha os rótulos "CEP", "Endereco", "Numero", "Complemento", "Bairro", "Cidade", "UF" para não quebrar os E2E).

Etapas internas do `AuthFlow` (estado local `step`):

1. `cpf` — campo "CPF" + botão "Continuar" → `useIdentify`.
2. Conforme o resultado:
   - `account` → campo "Senha" + "Entrar" (`useLogin`) + botão "Esqueci minha senha" (→ `useRequestCode({ purpose: 'reset' })` e etapa `code`).
   - `first_access` → texto "Encontramos seu cadastro. Enviaremos um código para {maskedEmail}." + botão "Enviar código" (→ `useRequestCode({ purpose: 'first_access' })` e etapa `code`).
   - `no_email` → texto "Seu cadastro não tem e-mail. Procure a lotérica ou o suporte para incluir, ou informe o código que recebeu do atendimento." + campos "Código", "E-mail", "Senha", "Confirmar senha" → `useSetPassword({ cpf, code, password, email })`.
   - `new` → formulário de cadastro (`signupFormSchema`: nome, celular, e-mail, endereço, senha, confirmação; CPF já preenchido e só leitura) + "Enviar código" (→ `useRequestCode({ purpose: 'signup', email })` e etapa `signup-code`).
3. `code` (primeiro acesso/esqueci) → `CodeStep` com "Código", "Nova senha", "Confirmar senha", "Reenviar código" (desabilitado com contagem de 60 s) → `useSetPassword`.
4. `signup-code` → `CodeStep` só com "Código" → `useRegister({ customer: toProfile(form), password, code })`.

- Link "Trocar CPF" volta à etapa 1 em todas as etapas.
- Erros de mutação em `<div className="inline-error" role="alert">`; `409 ACCOUNT_EXISTS` no cadastro volta à etapa 1 com a mensagem.
- Foco vai para o título de cada etapa ao trocar (`ref` + `focus()`), para leitor de tela e teclado.

- [ ] **Passo 1: testes (falhando)**

`AuthFlow.test.tsx`, com `vi.mock('../repository/account-repository', ...)` no mesmo padrão de `PurchasesPage.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { accountRepository } from '../repository/account-repository'
import { AuthFlow } from './AuthFlow'

vi.mock('../repository/account-repository', () => ({
  accountRepository: {
    getMe: vi.fn(),
    identify: vi.fn(),
    requestCode: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    setPassword: vi.fn(),
    updateProfile: vi.fn(),
    logout: vi.fn(),
  },
}))

const account = {
  cpf: '52998224725',
  name: 'Maria da Silva',
  email: 'maria@example.com',
  phone: '84999855367',
  complete: true,
}

function renderFlow(onAuthenticated = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthFlow onAuthenticated={onAuthenticated} />
    </QueryClientProvider>,
  )
  return onAuthenticated
}

async function typeCpf(cpf: string) {
  await userEvent.type(screen.getByLabelText('CPF', { exact: true }), cpf)
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
}

describe('AuthFlow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('entra com senha quando o CPF tem conta', async () => {
    vi.mocked(accountRepository.identify).mockResolvedValue({ status: 'account' })
    vi.mocked(accountRepository.login).mockResolvedValue(account)
    const onAuthenticated = renderFlow()
    await typeCpf('52998224725')
    await userEvent.type(await screen.findByLabelText('Senha'), 'senha-maria-1')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(accountRepository.login).toHaveBeenCalledWith('52998224725', 'senha-maria-1')
    expect(onAuthenticated).toHaveBeenCalledWith(account)
  })

  it('primeiro acesso mostra o e-mail mascarado e cria senha com o código', async () => {
    vi.mocked(accountRepository.identify).mockResolvedValue({
      status: 'first_access',
      maskedEmail: 'ma***@example.com',
    })
    vi.mocked(accountRepository.requestCode).mockResolvedValue()
    vi.mocked(accountRepository.setPassword).mockResolvedValue(account)
    const onAuthenticated = renderFlow()
    await typeCpf('52998224725')
    expect(await screen.findByText(/ma\*\*\*@example\.com/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
    await userEvent.type(await screen.findByLabelText('Código'), '000000')
    await userEvent.type(screen.getByLabelText('Nova senha'), 'senha-maria-1')
    await userEvent.type(screen.getByLabelText('Confirmar senha'), 'senha-maria-1')
    await userEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }))
    expect(accountRepository.setPassword).toHaveBeenCalledWith({
      cpf: '52998224725',
      code: '000000',
      password: 'senha-maria-1',
    })
    expect(onAuthenticated).toHaveBeenCalledWith(account)
  })

  it('CPF sem e-mail mostra orientação', async () => {
    vi.mocked(accountRepository.identify).mockResolvedValue({ status: 'no_email' })
    renderFlow()
    await typeCpf('39053344705')
    expect(await screen.findByText(/procure a lotérica ou o suporte/i)).toBeVisible()
  })

  it('CPF novo preenche cadastro, recebe código e entra', async () => {
    vi.mocked(accountRepository.identify).mockResolvedValue({ status: 'new' })
    vi.mocked(accountRepository.requestCode).mockResolvedValue()
    vi.mocked(accountRepository.register).mockResolvedValue({ ...account, cpf: '11144477735' })
    const onAuthenticated = renderFlow()
    await typeCpf('11144477735')
    await userEvent.type(await screen.findByLabelText('Nome completo'), 'Cliente Novo')
    await userEvent.type(screen.getByLabelText('Celular com DDD'), '84999998888')
    await userEvent.type(screen.getByLabelText('Email'), 'novo@example.com')
    await userEvent.type(screen.getByLabelText('CEP'), '59062300')
    await userEvent.type(screen.getByLabelText('Endereco'), 'Avenida Lima e Silva')
    await userEvent.type(screen.getByLabelText('Numero'), '129')
    await userEvent.type(screen.getByLabelText('Bairro'), 'Nazare')
    await userEvent.type(screen.getByLabelText('Cidade'), 'Natal')
    await userEvent.type(screen.getByLabelText('UF'), 'RN')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-nova-1')
    await userEvent.type(screen.getByLabelText('Confirmar senha'), 'senha-nova-1')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
    expect(accountRepository.requestCode).toHaveBeenCalledWith({
      purpose: 'signup',
      cpf: '11144477735',
      email: 'novo@example.com',
    })
    await userEvent.type(await screen.findByLabelText('Código'), '000000')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar e entrar' }))
    expect(accountRepository.register).toHaveBeenCalledWith(
      expect.objectContaining({
        code: '000000',
        password: 'senha-nova-1',
        customer: expect.objectContaining({ cpf: '11144477735' }),
      }),
    )
    expect(onAuthenticated).toHaveBeenCalled()
  })
})
```

Run: `npx vitest run src/features/account/ui`
Esperado: FAIL.

- [ ] **Passo 2: implementar**

Implemente `AddressFields.tsx` movendo `AddressFields`/`Field` de `src/pages/CartPage.tsx` (mesma marcação e rótulos). Implemente `CodeStep.tsx` (campo "Código" com `inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`; botão "Reenviar código" com contagem regressiva de 60 s via `useEffect` + `setInterval`; campos de nova senha quando `withNewPassword`). Implemente `AuthFlow.tsx` com `react-hook-form` + `zodResolver` por etapa, nos textos e botões listados acima. Rótulos usados pelos testes: "CPF", "Senha", "Código", "Nova senha", "Confirmar senha", "Nome completo", "Celular com DDD", "Email", campos de endereço; botões "Continuar", "Entrar", "Esqueci minha senha", "Enviar código", "Criar senha e entrar", "Confirmar e entrar", "Reenviar código", "Trocar CPF".

- [ ] **Passo 3: rodar e commit**

Run: `npx vitest run src/features/account && npm run lint`
Esperado: PASS.

```bash
git add src
git commit -m "feat(account): fluxo de entrar e cadastrar com código por e-mail"
```

---

### Tarefa 12: Cabeçalho, `/entrar`, `/minha-conta` e checkout com sessão

**Arquivos:**

- Criar: `src/pages/LoginPage.tsx`, `src/pages/AccountPage.tsx`, `src/features/account/ui/AccountMenu.tsx`, `src/features/account/ui/RequireAccount.tsx`
- Modificar: `src/app/AppLayout.tsx`, `src/app/App.tsx`, `src/pages/CartPage.tsx`, `src/features/checkout/domain/types.ts`, `src/features/checkout/service/checkout-service.ts`, `src/features/checkout/service/customer-schema.ts`, `src/features/checkout/repository/checkout-repository.ts`, `src/features/checkout/api/schemas.ts`
- Remover: `src/features/checkout/repository/customer-repository.ts`, `src/features/checkout/runtime/use-customer-lookup.ts` e `.test.tsx`
- Teste: `src/pages/CartPage.test.tsx`, `src/app/AppLayout.test.tsx` (novo), `src/features/checkout/service/*.test.ts`

**Interfaces:**

- Consome: `useAccount`, `useLogout`, `AuthFlow`, `AddressFields`, `safeAccountRedirect`, `profileFormSchema`, `useUpdateProfile`.
- Produz: `CreateOrderInput = { raffles: [...]; beneficiaryName?: string; email?: string }`; `startCheckout(cart, options: OrderOptions)`; `orderOptionsSchema` (`email`, `buyingForThirdParty`, `beneficiaryName`) e `toOrderOptions(form)` em `customer-schema.ts` (renomear arquivo para `order-options.ts`); `<RequireAccount>{children}</RequireAccount>` redireciona para `/entrar?next=…`.

- [ ] **Passo 1: testes (falhando)**

Em `CartPage.test.tsx`, mockar `account-repository` como na tarefa 11 e trocar os casos de formulário de cliente por:

```tsx
it('sem sessão mostra o fluxo de entrar no lugar dos dados do comprador', async () => {
  vi.mocked(accountRepository.getMe).mockResolvedValue(null)
  renderCart()
  expect(await screen.findByLabelText('CPF', { exact: true })).toBeVisible()
  expect(screen.queryByRole('button', { name: /continuar para o pix/i })).not.toBeInTheDocument()
})

it('com sessão mostra o resumo da conta e cria o pedido sem dados pessoais no corpo', async () => {
  vi.mocked(accountRepository.getMe).mockResolvedValue({ ...account, address })
  renderCart()
  expect(await screen.findByText('Maria da Silva')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: /continuar para o pix/i }))
  expect(checkoutRepository.createOrder).toHaveBeenCalledWith({
    raffles: expect.any(Array),
    email: 'maria@example.com',
  })
})

it('conta incompleta pede para completar o cadastro', async () => {
  vi.mocked(accountRepository.getMe).mockResolvedValue({ ...account, complete: false })
  renderCart()
  expect(await screen.findByRole('link', { name: /completar meus dados/i })).toHaveAttribute(
    'href',
    '/minha-conta?next=/carrinho',
  )
})
```

Mantenha os testes existentes de carrinho (remover, esvaziar, esvaziar ao ir para o pagamento, conflito de reserva), agora com sessão mockada.

`src/app/AppLayout.test.tsx`:

```tsx
it('mostra Entrar sem sessão e Minha conta com sessão', async () => {
  vi.mocked(accountRepository.getMe).mockResolvedValue(null)
  const { unmount } = renderLayout()
  expect(await screen.findByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar')
  unmount()

  vi.mocked(accountRepository.getMe).mockResolvedValue(account)
  renderLayout()
  await userEvent.click(await screen.findByRole('button', { name: /minha conta/i }))
  expect(screen.getByRole('menuitem', { name: 'Minhas compras' })).toBeVisible()
  expect(screen.getByRole('menuitem', { name: 'Meus dados' })).toBeVisible()
  expect(screen.getByRole('menuitem', { name: 'Sair' })).toBeVisible()
})
```

Run: `npx vitest run src/pages/CartPage.test.tsx src/app`
Esperado: FAIL.

- [ ] **Passo 2: checkout**

`checkout/domain/types.ts`: remover `Customer`, `LookupCriteria`, `ExternalCustomer`, `CustomerLookupResult`, `CustomerRepository`; `CreateOrderInput` passa a `{ raffles: ...; beneficiaryName?: string; email?: string }`; adicionar `export type OrderOptions = { beneficiaryName?: string; email?: string }`.

`checkout/api/schemas.ts`: remover `customerLookupSchema`, `externalCustomerSchema` e o `addressSchema` local se ficarem sem uso.

`checkout/service/checkout-service.ts`:

```ts
export async function startCheckout(cart: Cart, options: OrderOptions) {
  const order = await checkoutRepository.createOrder({
    raffles: cart.entries.map((entry) => ({/* igual ao atual */})),
    ...options,
  })
  const checkout = await checkoutRepository.createCheckout(order.id, env.VITE_PAYMENT_RETURN_URL)
  return { order, checkout }
}
```

`checkout/service/customer-schema.ts` → renomear para `order-options.ts`:

```ts
import { z } from 'zod'
import type { OrderOptions } from '../domain/types'

export const orderOptionsSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email('Informe um email valido.')),
    buyingForThirdParty: z.boolean().optional(),
    beneficiaryName: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.buyingForThirdParty && (value.beneficiaryName ?? '').trim().length < 3) {
      context.addIssue({
        code: 'custom',
        path: ['beneficiaryName'],
        message: 'Informe o nome completo de quem vai concorrer.',
      })
    }
  })

export type OrderOptionsForm = z.input<typeof orderOptionsSchema>
export type OrderOptionsFormOutput = z.output<typeof orderOptionsSchema>

// O cadastro é sempre do comprador logado; o nome do terceiro vai só no bilhete.
export function toOrderOptions(form: OrderOptionsFormOutput): OrderOptions {
  const holder = form.beneficiaryName?.trim()
  return form.buyingForThirdParty && holder
    ? { email: form.email, beneficiaryName: holder }
    : { email: form.email }
}
```

Ajuste `customer-schema.test.ts` (renomeie para `order-options.test.ts`) e `checkout-service.test.ts` para as novas assinaturas. O mock de `checkout-repository.ts` não usa `customer`; só confirme que compila.

- [ ] **Passo 3: `CartPage`**

Substitua o `<form id="customer-form">` por:

```tsx
const account = useAccount()
// ...
{
  account.isPending ? (
    <section className="surface">
      <Spinner label="Verificando sua conta" />
    </section>
  ) : !account.data ? (
    <section className="surface form-surface">
      <AuthFlow title="Entre ou cadastre-se para finalizar" onAuthenticated={() => undefined} />
    </section>
  ) : !account.data.complete ? (
    <section className="surface form-surface">
      <p>Seu cadastro está incompleto. Complete endereço e celular para comprar.</p>
      <Link className="button button--primary" to="/minha-conta?next=/carrinho">
        Completar meus dados
      </Link>
    </section>
  ) : (
    <form
      id="customer-form"
      className="surface form-surface"
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      {/* resumo: nome, CPF mascarado (formatCpf), celular, endereço em uma linha; link "Editar" para /minha-conta?next=/carrinho */}
      {/* campo Email (padrão account.data.email), checkbox "Estou comprando para outra pessoa" e nome do terceiro, como hoje */}
    </form>
  )
}
```

`useForm<OrderOptionsForm, unknown, OrderOptionsFormOutput>` com `resolver: zodResolver(orderOptionsSchema)` e `defaultValues: { email: '', buyingForThirdParty: false, beneficiaryName: '' }`; um `useEffect` preenche `email` com `account.data.email` quando a conta carrega. O botão "Continuar para o Pix" só aparece com conta completa. `onSubmit` chama `startCheckout(currentCart, toOrderOptions(options))`; trate `ApiError` 401 mostrando de novo o `AuthFlow` (o cache global zera a sessão). Remova `AddressFields`/`Field` do arquivo (movidos na tarefa 11), `useCustomerLookup` e o efeito de preenchimento.

- [ ] **Passo 4: cabeçalho, páginas e rotas**

`AccountMenu.tsx`: sem sessão, `<Link className="cart-link" to="/entrar"><UserRound size={20} aria-hidden="true" /><span className="cart-link__label">Entrar</span></Link>`. Com sessão, botão `aria-haspopup="menu"` `aria-expanded` com rótulo "Minha conta" que abre `role="menu"` com três `role="menuitem"` (Minhas compras → `/minhas-compras`, Meus dados → `/minha-conta`, Sair → `useLogout` e navega para `/`). Fecha com Esc e clique fora; setas ↑/↓ movem o foco entre itens.

`AppLayout.tsx`: remover o `<form className="purchase-search">`, o estado `cpf` e `openPurchases`; colocar `<AccountMenu />` antes do link do carrinho. Remover CSS `.purchase-search` de `styles.css`.

`RequireAccount.tsx`: igual a `RequireAdmin`, redirecionando para `/entrar?next=${encodeURIComponent(location.pathname + location.search)}`.

`LoginPage.tsx`: `const next = safeAccountRedirect(searchParams.get('next'))`; se `useAccount().data` já existe, `<Navigate to={next} replace />`; senão título "Entrar" e `<AuthFlow onAuthenticated={() => navigate(next, { replace: true })} />`.

`AccountPage.tsx` (dentro de `RequireAccount`): formulário `profileFormSchema` preenchido com a conta (nome, celular, e-mail, `AddressFields`, "Senha atual"), CPF só leitura, botão "Salvar dados" → `useUpdateProfile`; sucesso mostra "Dados atualizados." e, se houver `?next=` válido, navega para ele.

`App.tsx`: rotas `entrar` → `<LoginPage />`, `minha-conta` → `<RequireAccount><AccountPage /></RequireAccount>`, `minhas-compras` → `<RequireAccount><PurchasesPage /></RequireAccount>`.

- [ ] **Passo 5: rodar e commit**

Run: `npm run check`
Esperado: PASS (o `PurchasesPage.test.tsx` pode falhar até a tarefa 13; se for o único, prossiga e resolva lá).

```bash
git add -A src
git commit -m "feat(account): botão Entrar, Minha conta e checkout com sessão"
```

---

### Tarefa 13: "Minhas compras" pela sessão e botão do admin

**Arquivos:**

- Modificar: `src/features/purchases/domain/types.ts`, `api/schemas.ts`, `repository/purchase-repository.ts`, `runtime/use-purchase-lookup.ts` (renomear para `use-my-purchases.ts`), `src/pages/PurchasesPage.tsx`, `src/pages/PurchasesPage.test.tsx`, `src/pages/PaymentPage.tsx` (nada a mudar além de confirmar que os links não passam CPF)
- Modificar (admin): `src/features/admin/domain/types.ts`, `repository/admin-repository.ts`, `runtime/admin-queries.ts`, `src/shared/config/api-routes.ts`, `src/pages/admin/AdminCustomersPage.tsx`, `src/pages/admin/AdminPages.test.tsx`

**Interfaces:**

- Produz: `PurchaseRepository.listMine(signal?): Promise<Purchase[]>`; `useMyPurchases()` com `queryKey: ['purchases', 'mine']`; `AdminRepository.issueCustomerAccessCode(cpf): Promise<{ code: string; expiresAt: string }>`; `useIssueCustomerAccessCode()`; `apiRoutes.adminCustomerAccessCode(cpf)`.

- [ ] **Passo 1: testes (falhando)**

`PurchasesPage.test.tsx`: troque `lookupByCpf` por `listMine` em todos os `vi.mocked(...)`; remova os casos de digitar CPF; acrescente:

```tsx
it('lista as compras da conta sem pedir CPF', async () => {
  vi.mocked(purchaseRepository.listMine).mockResolvedValue([paid])
  renderPage()
  expect(await screen.findByText('Pago', { exact: true })).toBeVisible()
  expect(screen.queryByLabelText('CPF do comprador')).not.toBeInTheDocument()
})
```

`AdminPages.test.tsx` (página de clientes):

```tsx
it('gera código de acesso para o cliente e mostra uma vez', async () => {
  vi.mocked(adminRepository.issueCustomerAccessCode).mockResolvedValue({
    code: '482913',
    expiresAt: '2026-10-17T12:00:00.000Z',
  })
  renderCustomersPage()
  await userEvent.click(
    await screen.findByRole('button', { name: /gerar código de acesso para maria da silva/i }),
  )
  await userEvent.click(screen.getByRole('button', { name: 'Gerar código' }))
  expect(await screen.findByText('482913')).toBeVisible()
})
```

Run: `npx vitest run src/pages`
Esperado: FAIL.

- [ ] **Passo 2: compras**

`purchase-repository.ts`:

```ts
const liveRepository: PurchaseRepository = {
  async listMine(signal) {
    const response = await requestJson(apiRoutes.myOrders, purchaseLookupSchema, { signal })
    return response.orders
  },
}

const mockRepository: PurchaseRepository = {
  async listMine() {
    await new Promise((resolve) => window.setTimeout(resolve, 250))
    return [structuredClone(mockPurchase)]
  },
}
```

(remova `mockCpf`; renomeie `purchaseLookupSchema` para `purchaseListSchema` se preferir, atualizando os imports.)

`use-my-purchases.ts`:

```ts
export function createUseMyPurchases(repository: PurchaseRepository) {
  return function useMyPurchases() {
    return useQuery({
      queryKey: ['purchases', 'mine'],
      queryFn: ({ signal }) => repository.listMine(signal),
      retry: false,
      staleTime: 0,
    })
  }
}

export const useMyPurchases = createUseMyPurchases(purchaseRepository)
```

`PurchasesPage.tsx`: remova `locationStateSchema`, o formulário de CPF, `cpfInput`, `inputError`, `onSubmit` e imports não usados; use `const purchases = useMyPurchases()`; mantenha estados de carregando, erro (com tentar de novo), vazio ("Nenhuma compra encontrada") e a lista atual. Subtítulo: "Compras feitas com sua conta."

- [ ] **Passo 3: admin**

`api-routes.ts`: `adminCustomerAccessCode: (cpf: string) => \`/v1/admin/customers/${encodeURIComponent(cpf)}/access-code\``. No repository admin (live): `issueCustomerAccessCode: (cpf) => requestJson(apiRoutes.adminCustomerAccessCode(cpf), z.object({ code: z.string().regex(/^\d{6}$/), expiresAt: z.iso.datetime() }), { method: 'POST' })`; no `unavailable`(mock) siga o padrão existente. Hook`useIssueCustomerAccessCode`com`mutationKey: adminKeys.all`.

`AdminCustomersPage.tsx`: nova coluna "Acesso" com botão `aria-label={\`Gerar código de acesso para ${customer.name}\`}`que abre o`ConfirmDialog`existente ("Gerar código de primeiro acesso? Ele vale por 24 horas e substitui o anterior." / botão "Gerar código"); após sucesso, um`Dialog` mostra o código em destaque, a validade (`formatDateTime`) e o aviso "Entregue só ao titular do CPF. O código não será mostrado de novo."

- [ ] **Passo 4: rodar e commit**

Run: `npm run check`
Esperado: PASS.

```bash
git add -A src
git commit -m "feat: Minhas compras pela conta e código de acesso no painel"
```

---

### Tarefa 14: E2E

**Arquivos:**

- Criar: `tests/e2e/helpers/account.ts`, `tests/e2e/account.spec.ts`
- Modificar: `tests/e2e/purchase.spec.ts`, `tests/e2e/purchases.spec.ts`, `tests/e2e/admin-sales.spec.ts` (se cria pedido pelo site), `playwright.config.ts` (`MAIL_PROVIDER: 'mock'` explícito no backend)

**Interfaces:**

- Produz (`helpers/account.ts`): `randomCpf(): string` (CPF válido aleatório), `signInAsMaria(page)`, `signUpNewCustomer(page, cpf?)`.

- [ ] **Passo 1: helpers**

```ts
import { expect, type Page } from '@playwright/test'

export function randomCpf() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10))
  const digit = (numbers: number[]) => {
    const sum = numbers.reduce(
      (total, value, index) => total + value * (numbers.length + 1 - index),
      0,
    )
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  const first = digit(base)
  return [...base, first, digit([...base, first])].join('')
}

// Maria existe no mock da API com e-mail. Na primeira execução do servidor faz o primeiro
// acesso; nas seguintes, entra com a senha criada.
export async function signInAsMaria(page: Page) {
  await page.getByLabel('CPF', { exact: true }).fill('52998224725')
  await page.getByRole('button', { name: 'Continuar' }).click()
  const password = page.getByLabel('Senha', { exact: true })
  const sendCode = page.getByRole('button', { name: 'Enviar código' })
  await expect(password.or(sendCode)).toBeVisible()
  if (await sendCode.isVisible()) {
    await sendCode.click()
    await page.getByLabel('Código').fill('000000')
    await page.getByLabel('Nova senha').fill('senha-maria-1')
    await page.getByLabel('Confirmar senha').fill('senha-maria-1')
    await page.getByRole('button', { name: 'Criar senha e entrar' }).click()
    return
  }
  await password.fill('senha-maria-1')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

export async function signUpNewCustomer(page: Page, cpf = randomCpf()) {
  await page.getByLabel('CPF', { exact: true }).fill(cpf)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Nome completo').fill('Cliente Novo')
  await page.getByLabel('Celular com DDD').fill('84999998888')
  await page.getByLabel('Email').fill(`cliente-${cpf}@example.com`)
  await page.getByLabel('CEP').fill('59062300')
  await page.getByLabel('Endereco').fill('Avenida Lima e Silva')
  await page.getByLabel('Numero').fill('129')
  await page.getByLabel('Bairro').fill('Nazare')
  await page.getByLabel('Cidade').fill('Natal')
  await page.getByLabel('UF').fill('RN')
  await page.getByLabel('Senha', { exact: true }).fill('senha-nova-1')
  await page.getByLabel('Confirmar senha').fill('senha-nova-1')
  await page.getByRole('button', { name: 'Enviar código' }).click()
  await page.getByLabel('Código').fill('000000')
  await page.getByRole('button', { name: 'Confirmar e entrar' }).click()
  return cpf
}
```

- [ ] **Passo 2: atualizar specs de compra**

`purchase.spec.ts`: em "cliente existente finaliza compra", após adicionar ao carrinho, `await signInAsMaria(page)` e esperar `page.getByText('Maria da Silva')`; remover preenchimento de CPF/celular e "Cliente encontrado". Em "cliente novo informa endereço na surpresinha", trocar por `await signUpNewCustomer(page)`. Em "quarta e domingo", `await signInAsMaria(page)`.

`purchases.spec.ts`: o primeiro teste entra como Maria no carrinho e, depois do pagamento, clica em "Ver minhas compras" e confere a lista sem digitar CPF. Substitua o teste do campo de CPF no cabeçalho por:

```ts
test('Minhas compras sem sessão leva para Entrar e volta após o login', async ({ page }) => {
  await page.goto('/minhas-compras')
  await expect(page).toHaveURL(/\/entrar\?next=%2Fminhas-compras/)
  await signInAsMaria(page)
  await expect(page).toHaveURL(/\/minhas-compras$/)
  await expect(page.getByRole('heading', { name: 'Minhas compras' })).toBeVisible()
})
```

- [ ] **Passo 3: `account.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { randomCpf, signUpNewCustomer } from './helpers/account'

test('cadastra pelo botão Entrar, sai e entra de novo com a senha', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Entrar' }).click()
  const cpf = await signUpNewCustomer(page, randomCpf())
  await page.getByRole('button', { name: /minha conta/i }).click()
  await page.getByRole('menuitem', { name: 'Sair' }).click()
  await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible()

  await page.getByRole('link', { name: 'Entrar' }).click()
  await page.getByLabel('CPF', { exact: true }).fill(cpf)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Senha', { exact: true }).fill('senha-nova-1')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('button', { name: /minha conta/i })).toBeVisible()
})

test('esqueci minha senha troca a senha pelo código', async ({ page }) => {
  await page.goto('/entrar')
  const cpf = await signUpNewCustomer(page, randomCpf())
  await page.getByRole('button', { name: /minha conta/i }).click()
  await page.getByRole('menuitem', { name: 'Sair' }).click()
  await page.goto('/entrar')
  await page.getByLabel('CPF', { exact: true }).fill(cpf)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click()
  await page.getByLabel('Código').fill('000000')
  await page.getByLabel('Nova senha').fill('senha-trocada-1')
  await page.getByLabel('Confirmar senha').fill('senha-trocada-1')
  await page.getByRole('button', { name: 'Criar senha e entrar' }).click()
  await expect(page.getByRole('button', { name: /minha conta/i })).toBeVisible()
})
```

No celular, se o rótulo "Entrar" do link ficar oculto (como `.cart-link__label`), o `aria-label` precisa ser "Entrar"; confira no projeto `mobile`.

- [ ] **Passo 4: rodar**

Run: `npm run test:e2e`
Esperado: PASS nos dois projetos (chromium e mobile).

- [ ] **Passo 5: commit**

```bash
git add tests playwright.config.ts
git commit -m "test(e2e): jornadas de cadastro, login e compra com conta"
```

---

### Tarefa 15: Documentação

**Arquivos:**

- Modificar: `docs/PRODUCT.md`, `docs/API_CONTRACTS.md`, `docs/SECURITY.md`, `ARCHITECTURE.md`, `docs/BACKEND.md`, `docs/FRONTEND.md` (se listam domínios/features), `docs/exec-plans/tech-debt-tracker.md`, `docs/QUALITY_SCORE.md` (se lista domínios)
- Criar: `docs/design-docs/2026-10-16-login-cliente.md`

- [ ] **Passo 1: PRODUCT**

- Jornada principal, passo 4: "Entrar ou cadastrar-se (CPF e senha; cadastro novo confirma o e-mail por código)".
- Trocar a regra de busca de cliente por CPF e a de endereço revisado por: "O checkout exige conta. Os dados do comprador vêm da conta; o pedido só informa e-mail e, opcionalmente, o nome do terceiro. Endereço e dados pessoais se editam em Meus dados, que regrava o cadastro na API por `POST /pessoa/cadastro`."
- Nova regra de login: os quatro estados do CPF, código por e-mail (15 min, 5 tentativas, reenvio após 60 s), código do admin (24 h) para cadastro sem e-mail, sessão de 30 dias sem uso.
- "Minhas compras": exige sessão; sem CPF no cabeçalho.
- Painel/Clientes: botão de código de primeiro acesso.

- [ ] **Passo 2: API_CONTRACTS**

Remover `GET /api/v1/customers/lookup` e `POST /api/v1/orders/lookup`; documentar `/api/v1/account/*` (corpos, respostas, códigos de erro: `INVALID_CREDENTIALS`, `INVALID_CODE`, `CODE_RESEND_TOO_SOON`, `ACCOUNT_EXISTS`, `ACCOUNT_NOT_FOUND`, `EMAIL_NOT_REGISTERED`, `EMAIL_REQUIRED`, `MAIL_UNAVAILABLE`, `UNAUTHENTICATED`, `PROFILE_INCOMPLETE`, `RATE_LIMITED`), `GET /api/v1/orders/mine`, a mudança no corpo de `POST /api/v1/orders` e `POST /api/v1/admin/customers/:cpf/access-code`. Atualizar o exemplo de criação de pedido sem `customer`.

- [ ] **Passo 3: SECURITY**

Substituir o item de "Minhas compras" por um item de login de cliente: hash `scrypt`, cookie `customer_session` (`HttpOnly`, `SameSite=Strict`, `Secure` em HTTPS, `path=/api`), hash SHA-256 da sessão no banco, 30 dias sem uso; códigos com hash, 15 min, 5 tentativas; destino sempre do cadastro; limites por IP e CPF; `identify` revela se o CPF está cadastrado (risco aceito pelo cliente em 16/10/2026); senha também trafega até a API de bilhetes, sem TLS enquanto `TICKET_API_ALLOW_HTTP=true`; `MAIL_PROVIDER=mock` nunca em produção (código fixo).

- [ ] **Passo 4: ARCHITECTURE, BACKEND, FRONTEND**

Adicionar `accounts/` no mapa do backend ("conta de cliente, sessão, códigos e e-mail") e `account/` no do frontend ("domain → api → repository → service → runtime → ui"); no fluxo de compra, trocar "identificação" por "entrar/cadastrar".

- [ ] **Passo 5: dívida técnica**

Remover a linha "Minhas compras autentica só por CPF". Adicionar:

| Item                                            | Impacto                                                      | Gatilho para resolver             |
| ----------------------------------------------- | ------------------------------------------------------------ | --------------------------------- |
| `identify` revela se o CPF tem cadastro         | enumeração de CPFs cadastrados (limitada por IP)             | abuso observado ou exigência LGPD |
| Senha do cliente vai à API de bilhetes por HTTP | senha sem TLS entre backend e API                            | origem HTTPS oficial              |
| Limites de login e código em memória            | reinício zera contadores; várias instâncias não compartilham | mais de uma instância ou abuso    |

- [ ] **Passo 6: design doc e fechamento do plano**

`docs/design-docs/2026-10-16-login-cliente.md`: resumo das decisões (tabela da spec) com link para a spec. Neste plano, preencher "Progresso" e "Validação"; mover para `docs/exec-plans/completed/` ao concluir.

- [ ] **Passo 7: verificação final e commit**

Run: `npm run check && npm run test:e2e`
Esperado: PASS.

```bash
git add -A docs ARCHITECTURE.md
git commit -m "docs: login de cliente, contratos e segurança"
```

---

## Pendências para produção

Bloqueiam ligar o login de cliente com `TICKET_PROVIDER=live` e SMTP em produção:

- Executar a tarefa 0 antes de `TICKET_PROVIDER=live` com SMTP: `POST /pessoa/cadastro` pode apagar campos omitidos, como os endereços parciais de quem foi cadastrado na lotérica, e o contrato ainda não foi validado contra a API real.
- Não usar `TICKET_API_ALLOW_HTTP=true` com o login ativo: as senhas trafegariam sem TLS entre o backend e a API de bilhetes.
- Definir `TRUST_PROXY` no deploy atrás de proxy/HTTPS; sem ele os limites por IP valem para o site inteiro.
- Configurar o SMTP (`MAIL_PROVIDER=smtp` e `SMTP_*`); com `PUBLIC_APP_URL` HTTPS o servidor recusa iniciar com `MAIL_PROVIDER=mock`.

## Decisões e alternativas descartadas

Ver a tabela da spec. No plano: `OrderService` continua recebendo `customer` (a rota monta a partir da sessão), para não reescrever os testes do serviço; cookie registrado no escopo raiz porque `@fastify/cookie` não pode ser registrado duas vezes na mesma árvore.

## Progresso

- 2026-10-16: spec aprovada e plano criado.
- 2026-10-16: tarefas 1 a 12 implementadas e revisadas: migração v8, `shared/password`, e-mail (mock/SMTP), `CustomerGateway.register`, `verification-service`, `account-service`, rotas `/api/v1/account/*` com limites, pedido e Minhas compras pela sessão, código de acesso no painel, feature `account` no frontend (`AuthFlow`, cabeçalho, `/entrar`, `/minha-conta`, carrinho).
- 2026-10-17: tarefa 13 (remoção de `customers/lookup` e `orders/lookup`, Minhas compras pela conta), tarefa 14 (E2E de cadastro, login e compra com conta) e tarefa 15 (documentação) concluídas.
- Decisões durante a execução: limites por IP de `identify` e `codes` configuráveis por env (`ACCOUNT_IDENTIFY_LIMIT_PER_MINUTE`, `ACCOUNT_CODE_LIMIT_PER_MINUTE`; 1000 no Playwright); código do admin restrito a CPF sem e-mail (`409 CUSTOMER_HAS_EMAIL`); `/codes` repassa erros de domínio em vez de sempre `202`; limite de 10 falhas por hora por CPF em `/register` e `/password`; código fixo `000000` só com e-mail, bilhetes e pagamento todos mock; `requestJson` aceita `202`/`204` sem corpo; `401` só derruba a sessão no frontend com `UNAUTHENTICATED`; `safeAccountRedirect` recusa barra invertida.
- 2026-10-17: correções da revisão final: `TRUST_PROXY` repassado ao Fastify; log da falha do SMTP só com `code`/`responseCode`/`command` e timeouts; limite de código errado só com `INVALID_CODE`; código de acesso por CPF digitado no painel; `externalId` fora das respostas de conta; cache de Minhas compras limpo ao trocar de conta; `AccountRepository.updatePassword` removido; `MAIL_PROVIDER=mock` recusado com `PUBLIC_APP_URL` HTTPS; runbook de CPF sequestrado em `docs/SECURITY.md` e novos itens no rastreador de dívida.
- Pendente: tarefa 0 (validar `POST /pessoa/cadastro` na API real, exige CPF de teste autorizado). Por isso este plano continua em `active/`; ao concluí-la, ajustar o gateway live e `docs/API_CONTRACTS.md` se o contrato divergir e mover para `completed/`.

## Validação

- 2026-10-17: `npm run check` (lint, prettier, validate:architecture, validate:docs, testes e build) e `npm run test:e2e` (chromium e mobile Pixel 7) passam com os providers mock; ver relatório da tarefa 15 em `.superpowers/sdd/2026-10-16-login-cliente/`.
- Não validado: `POST /pessoa/cadastro` contra a API real (tarefa 0); envio por SMTP real (`MAIL_PROVIDER=smtp`); `TRUST_PROXY` atrás do proxy de produção. Ver "Pendências para produção".
