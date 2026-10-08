import { z } from 'zod'

// O ID passa por regex antes de virar URL de imagem ou de embed.
export const siteSettingsSchema = z.object({
  youtubeVideoId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{11}$/)
    .nullable(),
})
