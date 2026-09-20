import { expect, test } from '@playwright/test'

test('seleciona uma cartela e confirma o pagamento demonstrativo', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /seu próximo número/i })).toBeVisible()
  await page.getByRole('button', { name: /ir para o carrinho/i }).click()

  await page.getByLabel('Nome completo').fill('Maria da Silva')
  await page.getByLabel('CPF').fill('52998224725')
  await page.getByLabel('Celular com DDD').fill('85999998888')
  await page.getByRole('button', { name: /continuar para o pix/i }).click()

  await expect(page.getByRole('heading', { name: /suas cartelas estão garantidas/i })).toBeVisible({
    timeout: 12_000,
  })
})
