import { createHash, randomBytes } from 'node:crypto'
import { DomainError } from '../../shared/errors.js'
import { hashPassword, verifyPassword } from '../../shared/password.js'
import type { CustomerGateway } from '../customers/customer-gateway.js'
import type { AccountRepository, StoredAccount } from './account-repository.js'
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

// Monta a conta campo a campo para o hash da senha nunca sair do serviço.
function withoutHash(stored: StoredAccount): Account {
  return {
    cpf: stored.cpf,
    externalId: stored.externalId,
    name: stored.name,
    email: stored.email,
    phone: stored.phone,
    ...(stored.address ? { address: stored.address } : {}),
  }
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
    return { token: this.createSession(cpf), account: withoutHash(account) }
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

    // Código do admin é para quem não tem e-mail no cadastro: o e-mail informado só vale nesse
    // caso, para que o código nunca troque o e-mail de quem já tem um.
    const email =
      code.purpose === 'admin' ? (person?.email ?? local?.email ?? input.email) : code.email
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
    const local = this.repository.findAccount(cpf)
    const person = await this.customers.findByCpf(cpf)
    if (!local && !person) {
      throw new DomainError('CPF não encontrado no cadastro.', 404, 'CUSTOMER_NOT_FOUND')
    }
    // Quem tem e-mail recupera o acesso pelo próprio e-mail, nunca por código do admin.
    if (person?.email || local?.email) {
      throw new DomainError(
        'Este CPF já tem e-mail no cadastro. Use "Esqueci minha senha".',
        409,
        'CUSTOMER_HAS_EMAIL',
      )
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
    return { account: withoutHash(stored), tokenHash }
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
