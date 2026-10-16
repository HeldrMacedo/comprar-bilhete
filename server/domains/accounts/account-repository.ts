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
