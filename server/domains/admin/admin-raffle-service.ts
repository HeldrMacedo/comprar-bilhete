import type {
  ContestAdminGateway,
  ContestSource,
  ContestValues,
} from '../tickets/contest-admin-gateway.js'
import type { AdminRepository } from './admin-repository.js'
import type { AdminSession } from './admin-auth-service.js'

export class AdminRaffleService {
  constructor(
    private readonly contests: ContestAdminGateway,
    private readonly audit: AdminRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list() {
    return this.contests.listContests()
  }

  async update(actor: AdminSession, source: ContestSource, values: ContestValues) {
    const before = (await this.contests.listContests()).find((slot) => slot.source === source)
    const saved = await this.contests.updateContest(source, values)
    const changes = Object.fromEntries(
      Object.entries(values)
        .filter(
          ([key, value]) =>
            JSON.stringify(before?.[key as keyof ContestValues]) !== JSON.stringify(value),
        )
        .map(([key, value]) => [
          key,
          { before: before?.[key as keyof ContestValues] ?? null, after: value },
        ]),
    )
    this.audit.recordAudit({
      userId: actor.user.id,
      action: 'raffle.update',
      targetId: saved.contestId,
      details: { source, changes },
      createdAt: this.now().toISOString(),
    })
    return saved
  }
}
