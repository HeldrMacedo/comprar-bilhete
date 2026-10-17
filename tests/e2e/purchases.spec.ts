import { expect, test } from '@playwright/test'
import { signInAsMaria } from './helpers/account'

test('consulta a compra paga em Minhas compras após o retorno do pagamento', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Quarta' }).click()
  await page.getByRole('button', { name: /adicionar ao carrinho/i }).click()
  await signInAsMaria(page)
  await expect(page.getByText('Maria da Silva')).toBeVisible()
  await page.getByRole('button', { name: /continuar para o pix/i }).click()
  await expect(page.getByRole('heading', { name: /seus bilhetes estão garantidos/i })).toBeVisible({
    timeout: 12_000,
  })

  await page.getByRole('link', { name: /ver minhas compras/i }).click()
  await expect(page).toHaveURL(/\/minhas-compras$/)

  const purchase = page.getByRole('article').first()
  await expect(purchase.getByText('Pago', { exact: true })).toBeVisible()
  await expect(purchase.getByText('Pix')).toBeVisible()
  await expect(purchase.getByLabel(/dezenas do bilhete/i).first()).toBeVisible()
  await expect(purchase.getByRole('button', { name: /compartilhar no whatsapp/i })).toBeVisible()
})

test('Minhas compras sem sessão leva para Entrar e volta após o login', async ({ page }) => {
  await page.goto('/minhas-compras')
  await expect(page).toHaveURL(/\/entrar\?next=%2Fminhas-compras/)
  await signInAsMaria(page)
  await expect(page).toHaveURL(/\/minhas-compras$/)
  await expect(page.getByRole('heading', { name: 'Minhas compras' })).toBeVisible()
})
