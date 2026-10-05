import { expect, test } from '@playwright/test'
import { activeRafflesSchema } from '../../src/features/raffle/api/schemas'

test('mostra cada concurso no destaque com sua contagem e navegação', async ({ page }) => {
  const firstDraw = new Date(Date.now() + (48 * 60 + 30) * 60 * 1_000).toISOString()
  const secondDraw = new Date(Date.now() + (72 * 60 + 30) * 60 * 1_000).toISOString()

  await page.route('**/api/v1/raffles/active', async (route) => {
    const response = await route.fetch()
    const raffles = activeRafflesSchema.parse(await response.json())
    await route.fulfill({
      response,
      json: raffles.map((raffle, index) => ({
        ...raffle,
        drawDate: index === 0 ? firstDraw : secondDraw,
      })),
    })
  })

  await page.goto('/')

  const carousel = page.getByRole('region', { name: 'Concursos ativos' })
  await expect(carousel.getByText('Concurso sorteio-setembro')).toBeVisible()
  await expect(carousel.getByRole('timer')).toContainText('2d')

  await carousel.getByRole('button', { name: 'Próximo concurso' }).click()
  await expect(carousel.getByText('Concurso sorteio-domingo')).toBeVisible()
  await expect(carousel.getByRole('timer')).toContainText('3d')
  await expect(carousel.getByText('2 de 2')).toBeVisible()
  await expect(
    carousel.getByRole('button', { name: 'Mostrar concurso sorteio-domingo' }),
  ).toHaveAttribute('aria-current', 'true')
})
