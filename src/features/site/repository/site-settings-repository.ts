import { requestJson } from '../../../shared/api/http-client'
import { apiRoutes } from '../../../shared/config/api-routes'
import { env } from '../../../shared/config/env'
import { siteSettingsSchema } from '../api/schemas'
import type { SiteSettingsRepository } from '../domain/types'

const liveRepository: SiteSettingsRepository = {
  get: (signal) => requestJson(apiRoutes.siteSettings, siteSettingsSchema, { signal }),
}

const mockRepository: SiteSettingsRepository = {
  get: async () => ({ youtubeVideoId: null }),
}

export const siteSettingsRepository = env.VITE_API_MODE === 'live' ? liveRepository : mockRepository
