import { expect, test } from '@playwright/test'

test('cliente existente finaliza compra demonstrativa', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /seu próximo número/i })).toBeVisible()
  await page.getByRole('button', { name: /ir para o carrinho/i }).click()
  await page.getByLabel('CPF').fill('52998224725')
  await page.getByLabel('Celular com DDD').fill('84999855367')
  await expect(page.getByText('Cliente encontrado')).toBeVisible()
  await page.getByRole('button', { name: /continuar para o pix/i }).click()
  await expect(page.getByRole('heading', { name: /suas cartelas estão garantidas/i })).toBeVisible({
    timeout: 12_000,
  })
})

test('cliente novo informa endereço na surpresinha', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Aumentar quantidade' }).click()
  await page.getByRole('button', { name: /ir para o carrinho/i }).click()
  await page.getByLabel('Nome completo').fill('Cliente Novo')
  await page.getByLabel('CPF').fill('11144477735')
  await page.getByLabel('Celular com DDD').fill('84999998888')
  await expect(page.getByText('Complete seu endereco').first()).toBeVisible()
  await page.getByLabel('CEP').fill('59062300')
  await page.getByLabel('Endereco').fill('Avenida Lima e Silva')
  await page.getByLabel('Numero').fill('129')
  await page.getByLabel('Bairro').fill('Nazare')
  await page.getByLabel('Cidade').fill('Natal')
  await page.getByLabel('UF').fill('RN')
  await page.getByRole('button', { name: /continuar para o pix/i }).click()
  await expect(page.getByRole('heading', { name: /suas cartelas estão garantidas/i })).toBeVisible({
    timeout: 12_000,
  })
})
