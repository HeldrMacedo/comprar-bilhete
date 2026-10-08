export type SiteSettings = { youtubeVideoId: string | null }

export interface SiteSettingsRepository {
  get(signal?: AbortSignal): Promise<SiteSettings>
}
