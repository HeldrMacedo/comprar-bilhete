import type { AppDatabase } from '../../shared/database.js'
import { z } from 'zod'
import { adminUserRowSchema, type AdminUserRecord } from './admin-types.js'

const auditRowSchema = z.object({
  id: z.number(),
  user_id: z.string().nullable(),
  action: z.string(),
  target_id: z.string().nullable(),
  details_json: z.string(),
  created_at: z.string(),
})

const sessionRowSchema = adminUserRowSchema.extend({
  session_created_at: adminUserRowSchema.shape.created_at,
  last_seen_at: adminUserRowSchema.shape.created_at,
  expires_at: adminUserRowSchema.shape.created_at,
})

export type SessionWithUser = {
  user: AdminUserRecord
  createdAt: string
  lastSeenAt: string
  expiresAt: string
}

export class AdminRepository {
  constructor(private readonly database: AppDatabase) {}

  countUsers() {
    const row = this.database.prepare('SELECT COUNT(*) AS total FROM admin_users').get() as {
      total: number
    }
    return row.total
  }

  countActiveUsers() {
    const row = this.database
      .prepare('SELECT COUNT(*) AS total FROM admin_users WHERE active = 1')
      .get() as { total: number }
    return row.total
  }

  listUsers() {
    return this.database
      .prepare('SELECT * FROM admin_users ORDER BY name COLLATE NOCASE, login')
      .all()
      .map((row) => adminUserRowSchema.parse(row))
  }

  findUserById(id: string) {
    const row = this.database.prepare('SELECT * FROM admin_users WHERE id = ?').get(id)
    return row ? adminUserRowSchema.parse(row) : null
  }

  findUserByLogin(login: string) {
    const row = this.database.prepare('SELECT * FROM admin_users WHERE login = ?').get(login)
    return row ? adminUserRowSchema.parse(row) : null
  }

  insertUser(user: AdminUserRecord) {
    this.database
      .prepare(
        `INSERT INTO admin_users (id, login, name, password_hash, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        user.id,
        user.login,
        user.name,
        user.password_hash,
        user.active ? 1 : 0,
        user.created_at,
        user.updated_at,
      )
  }

  updateUser(user: AdminUserRecord) {
    this.database
      .prepare(
        `UPDATE admin_users
         SET login = ?, name = ?, password_hash = ?, active = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(user.login, user.name, user.password_hash, user.active ? 1 : 0, user.updated_at, user.id)
  }

  deleteUser(id: string) {
    this.database.prepare('DELETE FROM admin_users WHERE id = ?').run(id)
  }

  insertSession(tokenHash: string, userId: string, createdAt: string, expiresAt: string) {
    this.database
      .prepare(
        `INSERT INTO admin_sessions (token_hash, user_id, created_at, last_seen_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(tokenHash, userId, createdAt, createdAt, expiresAt)
  }

  findSession(tokenHash: string): SessionWithUser | null {
    const row = this.database
      .prepare(
        `SELECT u.*, s.created_at AS session_created_at, s.last_seen_at, s.expires_at
         FROM admin_sessions s
         JOIN admin_users u ON u.id = s.user_id
         WHERE s.token_hash = ?`,
      )
      .get(tokenHash)
    if (!row) return null
    const { session_created_at, last_seen_at, expires_at, ...user } = sessionRowSchema.parse(row)
    return {
      user,
      createdAt: session_created_at,
      lastSeenAt: last_seen_at,
      expiresAt: expires_at,
    }
  }

  touchSession(tokenHash: string, lastSeenAt: string, expiresAt: string) {
    this.database
      .prepare('UPDATE admin_sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?')
      .run(lastSeenAt, expiresAt, tokenHash)
  }

  deleteSession(tokenHash: string) {
    this.database.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash)
  }

  deleteUserSessions(userId: string, exceptTokenHash?: string) {
    this.database
      .prepare('DELETE FROM admin_sessions WHERE user_id = ? AND token_hash IS NOT ?')
      .run(userId, exceptTokenHash ?? null)
  }

  deleteExpiredSessions(now: string) {
    this.database.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(now)
  }

  recordAudit(entry: {
    userId: string | null
    action: string
    targetId?: string
    details?: Record<string, unknown>
    createdAt: string
  }) {
    this.database
      .prepare(
        `INSERT INTO admin_audit_log (user_id, action, target_id, details_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        entry.userId,
        entry.action,
        entry.targetId ?? null,
        JSON.stringify(entry.details ?? {}),
        entry.createdAt,
      )
  }

  listAudit(limit: number) {
    return this.database
      .prepare('SELECT * FROM admin_audit_log ORDER BY id DESC LIMIT ?')
      .all(limit)
      .map((row) => auditRowSchema.parse(row))
  }
}
