import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../test/render-with-query'
import { siteSettingsRepository } from '../repository/site-settings-repository'
import { DrawVideo } from './DrawVideo'

vi.mock('../repository/site-settings-repository', () => ({
  siteSettingsRepository: { get: vi.fn() },
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

it('shows the thumbnail and loads the privacy-enhanced player only after a click', async () => {
  vi.mocked(siteSettingsRepository.get).mockResolvedValue({ youtubeVideoId: 'dQw4w9WgXcQ' })
  const Wrapper = createQueryWrapper()
  render(<DrawVideo />, { wrapper: Wrapper })

  const play = await screen.findByRole('button', { name: 'Reproduzir vídeo do sorteio' })
  expect(screen.queryByTitle('Vídeo do sorteio no YouTube')).not.toBeInTheDocument()

  await userEvent.click(play)
  expect(screen.getByTitle('Vídeo do sorteio no YouTube')).toHaveAttribute(
    'src',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0',
  )
})

it('renders nothing when no video is configured', async () => {
  vi.mocked(siteSettingsRepository.get).mockResolvedValue({ youtubeVideoId: null })
  const Wrapper = createQueryWrapper()
  const { container } = render(<DrawVideo />, { wrapper: Wrapper })

  await vi.waitFor(() => expect(siteSettingsRepository.get).toHaveBeenCalled())
  expect(container).toBeEmptyDOMElement()
})
