import { createHash, randomBytes } from 'node:crypto'
import { DomainError } from '../../shared/errors.js'
import type { AdminRepository } from './admin-repository.js'
import { toAdminUser, type AdminUser } from './admin-types.js'
import { hashPassword, verifyPassword } from './password.js'

export const SESSION_IDLE_MS = 8 * 60 * 60_000
export const SESSION_MAX_MS = 24 * 60 * 60_000
const TOUCH_INTERVAL_MS = 60_000

// Hash fictício: usuário inexistente gasta o mesmo tempo de scrypt que senha errada.
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'))

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export type AdminSession = { user: AdminUser; tokenHash: string }

export class AdminAuthService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async login(login: string, password: string) {
    const user = this.repository.findUserByLogin(login)
    const valid = await verifyPassword(password, user?.password_hash ?? (await DUMMY_HASH))
    if (!user || !user.active || !valid) {
      throw new DomainError('Usuário ou senha inválidos.', 401, 'ADMIN_INVALID_CREDENTIALS')
    }

    const current = this.now()
    this.repository.deleteExpiredSessions(current.toISOString())
    const token = randomBytes(32).toString('base64url')
    this.repository.insertSession(
      hashSessionToken(token),
      user.id,
      current.toISOString(),
      new Date(current.getTime() + SESSION_IDLE_MS).toISOString(),
    )
    this.repository.recordAudit({
      userId: user.id,
      action: 'session.login',
      createdAt: current.toISOString(),
    })
    return { token, user: toAdminUser(user) }
  }

  authenticate(token: string | undefined): AdminSession | null {
    if (!token) return null
    const tokenHash = hashSessionToken(token)
    const session = this.repository.findSession(tokenHash)
    if (!session) return null

    const current = this.now().getTime()
    const expired =
      Date.parse(session.expiresAt) <= current ||
      Date.parse(session.createdAt) + SESSION_MAX_MS <= current
    if (expired || !session.user.active) {
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
    return { user: toAdminUser(session.user), tokenHash }
  }

  logout(session: AdminSession) {
    this.repository.deleteSession(session.tokenHash)
    this.repository.recordAudit({
      userId: session.user.id,
      action: 'session.logout',
      createdAt: this.now().toISOString(),
    })
  }

  // Cria o primeiro administrador a partir do ambiente, apenas com a tabela vazia.
  async bootstrap(login: string, name: string, password: string) {
    if (this.repository.countUsers() > 0) return false
    const createdAt = this.now().toISOString()
    this.repository.insertUser({
      id: crypto.randomUUID(),
      login,
      name,
      password_hash: await hashPassword(password),
      active: true,
      created_at: createdAt,
      updated_at: createdAt,
    })
    this.repository.recordAudit({ userId: null, action: 'user.bootstrap', createdAt })
    return true
  }
}
