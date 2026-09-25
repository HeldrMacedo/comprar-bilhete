import { expect, test } from '@playwright/test'

test('cliente existente finaliza compra demonstrativa', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /seu próximo número/i })).toBeVisible()
  await page.getByRole('button', { name: /ir para o carrinho/i }).click()
  await page.getByLabel('CPF').fill('52998224725')
  await page.getByLabel('Celular com DDD').fill('84999855367')
  await expect(page.getByText('Cliente encontrado')).toBeVisible()
  await page.getByRole('button', { name: /continuar para o pix/i }).click()
  await expect(page).toHaveURL(/order_nsu=/)
  expect(new URL(page.url()).searchParams.get('order_nsu')).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  )
  await expect(page.getByRole('heading', { name: /suas cartelas estão garantidas/i })).toBeVisible({
    timeout: 12_000,
  })
})

test('cliente novo informa endereço na surpresinha', async ({ page }, testInfo) => {
  const cpf = testInfo.project.name === 'mobile' ? '12345678909' : '11144477735'
  const phone = testInfo.project.name === 'mobile' ? '84999997777' : '84999998888'
  await page.goto('/')
  await page.getByRole('button', { name: 'Aumentar quantidade' }).click()
  await page.getByRole('button', { name: /ir para o carrinho/i }).click()
  await page.getByLabel('Nome completo').fill('Cliente Novo')
  await page.getByLabel('CPF').fill(cpf)
  await page.getByLabel('Celular com DDD').fill(phone)
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

test('compra cartelas de quarta e domingo em um pagamento', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('checkbox').nth(1).check()
  await expect(page.getByRole('heading', { name: /sorteio especial de setembro/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /sorteio de domingo/i })).toBeVisible()
  await page.getByRole('button', { name: /ir para o carrinho/i }).click()

  await expect(page.getByRole('heading', { name: /sorteio especial de setembro/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /sorteio de domingo/i })).toBeVisible()
  await expect(page.locator('.summary-total')).toContainText('R$ 16,00')
  await page.getByLabel('CPF').fill('52998224725')
  await page.getByLabel('Celular com DDD').fill('84999855367')
  await expect(page.getByText('Cliente encontrado')).toBeVisible()
  await page.getByRole('button', { name: /continuar para o pix/i }).click()
  await expect(page).toHaveURL(/order_nsu=/)
  await expect(page.getByRole('heading', { name: /suas cartelas estão garantidas/i })).toBeVisible({
    timeout: 12_000,
  })
})
