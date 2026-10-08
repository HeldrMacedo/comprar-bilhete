import { DomainError } from '../../shared/errors.js'
import type { AdminRepository } from './admin-repository.js'
import type { AdminSession } from './admin-auth-service.js'
import { toAdminUser, type CreateAdminUserInput, type UpdateAdminUserInput } from './admin-types.js'
import { hashPassword } from './password.js'

export class AdminUserService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list() {
    return this.repository.listUsers().map(toAdminUser)
  }

  async create(actor: AdminSession, input: CreateAdminUserInput) {
    this.assertLoginFree(input.login)
    const createdAt = this.now().toISOString()
    const user = {
      id: crypto.randomUUID(),
      login: input.login,
      name: input.name,
      password_hash: await hashPassword(input.password),
      active: true,
      created_at: createdAt,
      updated_at: createdAt,
    }
    this.repository.insertUser(user)
    this.audit(actor, 'user.create', user.id, { login: user.login })
    return toAdminUser(user)
  }

  async update(actor: AdminSession, id: string, input: UpdateAdminUserInput) {
    const current = this.requireUser(id)
    const isSelf = actor.user.id === id
    if (input.login !== undefined && input.login !== current.login) {
      this.assertLoginFree(input.login)
    }
    if (input.active === false && current.active) {
      if (isSelf) throw new DomainError('Você não pode desativar o próprio usuário.', 409)
      this.assertNotLastActive()
    }

    const updated = {
      ...current,
      login: input.login ?? current.login,
      name: input.name ?? current.name,
      active: input.active ?? current.active,
      password_hash:
        input.password === undefined ? current.password_hash : await hashPassword(input.password),
      updated_at: this.now().toISOString(),
    }
    this.repository.updateUser(updated)

    if (!updated.active) this.repository.deleteUserSessions(id)
    else if (input.password !== undefined) {
      // Troca de senha encerra as outras sessões; quem trocou a própria senha continua logado.
      this.repository.deleteUserSessions(id, isSelf ? actor.tokenHash : undefined)
    }

    this.audit(actor, 'user.update', id, {
      fields: Object.keys(input).filter((field) => field !== 'password'),
      passwordChanged: input.password !== undefined,
    })
    return toAdminUser(updated)
  }

  delete(actor: AdminSession, id: string) {
    const current = this.requireUser(id)
    if (actor.user.id === id) {
      throw new DomainError('Você não pode excluir o próprio usuário.', 409)
    }
    if (current.active) this.assertNotLastActive()
    this.repository.deleteUser(id)
    this.audit(actor, 'user.delete', id, { login: current.login })
  }

  private requireUser(id: string) {
    const user = this.repository.findUserById(id)
    if (!user) throw new DomainError('Usuário não encontrado.', 404)
    return user
  }

  private assertLoginFree(login: string) {
    if (this.repository.findUserByLogin(login)) {
      throw new DomainError('Já existe um usuário com esse login.', 409, 'ADMIN_LOGIN_TAKEN')
    }
  }

  private assertNotLastActive() {
    if (this.repository.countActiveUsers() <= 1) {
      throw new DomainError('O painel precisa de pelo menos um administrador ativo.', 409)
    }
  }

  private audit(
    actor: AdminSession,
    action: string,
    targetId: string,
    details: Record<string, unknown>,
  ) {
    this.repository.recordAudit({
      userId: actor.user.id,
      action,
      targetId,
      details,
      createdAt: this.now().toISOString(),
    })
  }
}
