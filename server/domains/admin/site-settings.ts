import { z } from 'zod'
import type { AppDatabase } from '../../shared/database.js'
import { DomainError } from '../../shared/errors.js'
import type { AdminRepository } from './admin-repository.js'
import type { AdminSession } from './admin-auth-service.js'

const YOUTUBE_KEY = 'youtube_video_id'
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'])

export const siteSettingsInputSchema = z.object({ youtubeUrl: z.string().trim().max(300) }).strict()

// Aceita só endereços do YouTube e guarda apenas o ID do vídeo; a Home monta a URL de embed.
export function parseYoutubeVideoId(input: string): string | null {
  if (!input) return null
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw invalidYoutubeUrl()
  }
  if (url.protocol !== 'https:' || !YOUTUBE_HOSTS.has(url.hostname)) throw invalidYoutubeUrl()
  const segments = url.pathname.split('/').filter(Boolean)
  const candidate =
    url.hostname === 'youtu.be'
      ? segments[0]
      : segments[0] === 'watch'
        ? url.searchParams.get('v')
        : ['embed', 'shorts', 'live'].includes(segments[0] ?? '')
          ? segments[1]
          : undefined
  if (!candidate || !VIDEO_ID.test(candidate)) throw invalidYoutubeUrl()
  return candidate
}

function invalidYoutubeUrl() {
  return new DomainError(
    'Informe um link de vídeo do YouTube (youtube.com ou youtu.be).',
    400,
    'INVALID_YOUTUBE_URL',
  )
}

export class SiteSettingsService {
  constructor(
    private readonly database: AppDatabase,
    private readonly audit: AdminRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getPublic() {
    const row = this.database
      .prepare('SELECT value FROM site_settings WHERE key = ?')
      .get(YOUTUBE_KEY) as { value: string } | undefined
    const youtubeVideoId = row && VIDEO_ID.test(row.value) ? row.value : null
    return { youtubeVideoId }
  }

  getAdmin() {
    const { youtubeVideoId } = this.getPublic()
    return {
      youtubeVideoId,
      youtubeUrl: youtubeVideoId ? `https://www.youtube.com/watch?v=${youtubeVideoId}` : '',
    }
  }

  update(actor: AdminSession, youtubeUrl: string) {
    const videoId = parseYoutubeVideoId(youtubeUrl)
    const before = this.getPublic().youtubeVideoId
    const updatedAt = this.now().toISOString()
    if (videoId) {
      this.database
        .prepare(
          `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
        .run(YOUTUBE_KEY, videoId, updatedAt)
    } else {
      this.database.prepare('DELETE FROM site_settings WHERE key = ?').run(YOUTUBE_KEY)
    }
    this.audit.recordAudit({
      userId: actor.user.id,
      action: 'settings.update',
      details: { youtubeVideoId: { before, after: videoId } },
      createdAt: updatedAt,
    })
    return this.getAdmin()
  }
}
