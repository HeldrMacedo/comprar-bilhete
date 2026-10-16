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
