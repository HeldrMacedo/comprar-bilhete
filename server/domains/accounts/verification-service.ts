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
