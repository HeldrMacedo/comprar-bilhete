import { expect, test } from '@playwright/test'

test('consulta a compra paga em Minhas compras após o retorno do pagamento', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Quarta' }).click()
  await page.getByRole('button', { name: /adicionar ao carrinho/i }).click()
  await page.getByLabel('CPF', { exact: true }).fill('52998224725')
  await page.getByLabel('Celular com DDD').fill('84999855367')
  await expect(page.getByText('Cliente encontrado')).toBeVisible()
  await page.getByRole('button', { name: /continuar para o pix/i }).click()
  await expect(page.getByRole('heading', { name: /suas cartelas estão garantidas/i })).toBeVisible({
    timeout: 12_000,
  })

  await page.getByRole('link', { name: /ver minhas compras/i }).click()
  await page.getByLabel('CPF do comprador').fill('52998224725')
  await page.getByRole('button', { name: 'Consultar' }).click()

  const purchase = page.getByRole('article').first()
  await expect(purchase.getByText('Pago', { exact: true })).toBeVisible()
  await expect(purchase.getByText('Pix')).toBeVisible()
  await expect(purchase.getByLabel(/dezenas da cartela/i).first()).toBeVisible()
  await expect(purchase.getByRole('button', { name: /compartilhar no whatsapp/i })).toBeVisible()
  expect(page.url()).not.toContain('52998224725')
})

test('abre Minhas compras pelo CPF digitado no cabeçalho', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'No celular o cabeçalho mostra apenas o botão.')
  await page.goto('/')
  await page.getByLabel('CPF para consultar compras').fill('39053344705')
  await page.getByRole('button', { name: /minhas compras/i }).click()

  await expect(page.getByRole('heading', { name: 'Nenhuma compra encontrada' })).toBeVisible()
  await expect(page.getByLabel('CPF do comprador')).toHaveValue('390.533.447-05')
  expect(page.url()).toMatch(/\/minhas-compras$/)
})
