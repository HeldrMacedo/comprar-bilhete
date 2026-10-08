import { useQuery } from '@tanstack/react-query'
import { siteSettingsRepository } from '../repository/site-settings-repository'

export function useSiteSettings() {
  return useQuery({
    queryKey: ['site-settings'],
    queryFn: ({ signal }) => siteSettingsRepository.get(signal),
    staleTime: 5 * 60_000,
  })
}
