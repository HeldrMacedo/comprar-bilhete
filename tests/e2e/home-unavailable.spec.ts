import { expect, test } from '@playwright/test'

test('home mantém o banner acima do aviso quando não há concurso atual', async ({ page }) => {
  await page.route('**/api/v1/raffles/active', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Nenhum concurso ativo encontrado' }),
    }),
  )

  await page.goto('/')

  const banner = page.locator('section.hero')
  const notice = page.getByRole('heading', { name: 'Sem sorteios ativo no momento' })
  await expect(banner).toBeVisible()
  await expect(notice).toBeVisible()
  await expect(page.getByRole('button', { name: /Ir para o carrinho/i })).toHaveCount(0)

  const bannerBox = await banner.boundingBox()
  const noticeBox = await notice.boundingBox()
  if (!bannerBox || !noticeBox) throw new Error('Banner ou aviso sem posição visível')
  expect(noticeBox.y).toBeGreaterThan(bannerBox.y + bannerBox.height)
})

test('mostra concurso HTTP para consulta e desabilita a compra', async ({ page }) => {
  await page.route('**/api/v1/raffles/active', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: '2026041',
          title: 'Sorteio de Domingo',
          description: 'Concurso atual',
          prize: 'R$ 5.000',
          drawDate: '2026-09-27T23:00:00.000Z',
          priceInCents: 600,
          purchaseEnabled: false,
        },
      ]),
    }),
  )
  await page.route('**/api/v1/raffles/2026041/cards*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'card-001', code: '#001', numbers: [1, 2, 3], available: true }]),
    }),
  )
  await page.goto('/')
  await expect(page.getByRole('checkbox', { name: /domingo/i })).toBeVisible()
  await expect(page.getByText(/apenas para consulta/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /Ir para o carrinho/i })).toBeDisabled()
})
