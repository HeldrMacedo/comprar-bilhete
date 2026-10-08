import { describe, expect, it } from 'vitest'
import { createDatabase } from '../../shared/database.js'
import { AdminAuthService, SESSION_IDLE_MS, SESSION_MAX_MS } from './admin-auth-service.js'
import { AdminRepository } from './admin-repository.js'
import { AdminUserService } from './admin-user-service.js'
import { hashPassword, verifyPassword } from './password.js'

const PASSWORD = 'senha-segura-123'

async function setup() {
  let current = new Date('2026-10-08T12:00:00.000Z')
  const now = () => current
  const repository = new AdminRepository(createDatabase(':memory:'))
  const auth = new AdminAuthService(repository, now)
  const users = new AdminUserService(repository, now)
  await auth.bootstrap('admin', 'Administrador', PASSWORD)
  const advance = (ms: number) => {
    current = new Date(current.getTime() + ms)
  }
  return { repository, auth, users, advance }
}

describe('password', () => {
  it('verifies only the original password', async () => {
    const hash = await hashPassword(PASSWORD)

    expect(hash).toMatch(/^scrypt\$/)
    expect(await verifyPassword(PASSWORD, hash)).toBe(true)
    expect(await verifyPassword('outra-senha-123', hash)).toBe(false)
    expect(await verifyPassword(PASSWORD, 'invalido')).toBe(false)
  })
})

describe('AdminAuthService', () => {
  it('bootstraps the first admin only once', async () => {
    const { auth, repository } = await setup()

    expect(await auth.bootstrap('outro', 'Outro', PASSWORD)).toBe(false)
    expect(repository.countUsers()).toBe(1)
  })

  it('logs in and authenticates the session token, storing only its hash', async () => {
    const { auth, repository } = await setup()
    const { token, user } = await auth.login('admin', PASSWORD)

    expect(user).toMatchObject({ login: 'admin', name: 'Administrador', active: true })
    expect(user).not.toHaveProperty('password_hash')
    expect(auth.authenticate(token)?.user.id).toBe(user.id)
    expect(repository.findSession(token)).toBeNull()
  })

  it('rejects wrong password and unknown user with the same message', async () => {
    const { auth } = await setup()

    await expect(auth.login('admin', 'senha-errada-000')).rejects.toThrow(
      'Usuário ou senha inválidos.',
    )
    await expect(auth.login('ninguem', PASSWORD)).rejects.toThrow('Usuário ou senha inválidos.')
  })

  it('expires idle sessions and caps session lifetime', async () => {
    const { auth, advance } = await setup()
    const idle = await auth.login('admin', PASSWORD)
    advance(SESSION_IDLE_MS)
    expect(auth.authenticate(idle.token)).toBeNull()

    const active = await auth.login('admin', PASSWORD)
    for (let elapsed = 0; elapsed < SESSION_MAX_MS; elapsed += SESSION_IDLE_MS / 2) {
      expect(auth.authenticate(active.token)).not.toBeNull()
      advance(SESSION_IDLE_MS / 2)
    }
    expect(auth.authenticate(active.token)).toBeNull()
  })

  it('logs out by deleting the session', async () => {
    const { auth } = await setup()
    const { token } = await auth.login('admin', PASSWORD)
    auth.logout(auth.authenticate(token)!)

    expect(auth.authenticate(token)).toBeNull()
  })
})

describe('AdminUserService', () => {
  it('creates users with unique logins and never exposes the hash', async () => {
    const { auth, users } = await setup()
    const actor = auth.authenticate((await auth.login('admin', PASSWORD)).token)!

    const created = await users.create(actor, { login: 'maria', name: 'Maria', password: PASSWORD })
    expect(created).not.toHaveProperty('password_hash')
    await expect(
      users.create(actor, { login: 'maria', name: 'Outra', password: PASSWORD }),
    ).rejects.toThrow('Já existe um usuário com esse login.')
    expect(users.list().map((user) => user.login)).toEqual(['admin', 'maria'])
  })

  it('blocks deleting or deactivating yourself and the last active admin', async () => {
    const { auth, users } = await setup()
    const actor = auth.authenticate((await auth.login('admin', PASSWORD)).token)!

    expect(() => users.delete(actor, actor.user.id)).toThrow(
      'Você não pode excluir o próprio usuário.',
    )
    await expect(users.update(actor, actor.user.id, { active: false })).rejects.toThrow(
      'Você não pode desativar o próprio usuário.',
    )

    const maria = await users.create(actor, { login: 'maria', name: 'Maria', password: PASSWORD })
    await users.update(actor, maria.id, { active: false })
    const mariaSession = { user: { ...maria, active: true }, tokenHash: 'x' }
    expect(() => users.delete(mariaSession, actor.user.id)).toThrow(
      'O painel precisa de pelo menos um administrador ativo.',
    )
  })

  it('ends other sessions when a password changes and all sessions when deactivated', async () => {
    const { auth, users } = await setup()
    const first = await auth.login('admin', PASSWORD)
    const second = await auth.login('admin', PASSWORD)
    const actor = auth.authenticate(first.token)!

    await users.update(actor, actor.user.id, { password: 'nova-senha-segura' })
    expect(auth.authenticate(first.token)).not.toBeNull()
    expect(auth.authenticate(second.token)).toBeNull()

    await users.create(actor, { login: 'maria', name: 'Maria', password: PASSWORD })
    const maria = await auth.login('maria', PASSWORD)
    await users.update(actor, maria.user.id, { active: false })
    expect(auth.authenticate(maria.token)).toBeNull()
    await expect(auth.login('maria', PASSWORD)).rejects.toThrow('Usuário ou senha inválidos.')
  })
})
