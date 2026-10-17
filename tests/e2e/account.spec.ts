import { expect, test } from '@playwright/test'
import { randomCpf, signUpNewCustomer } from './helpers/account'

test('cadastra pelo botão Entrar, sai e entra de novo com a senha', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Entrar' }).click()
  const cpf = await signUpNewCustomer(page, randomCpf())
  await page.getByRole('button', { name: /minha conta/i }).click()
  await page.getByRole('menuitem', { name: 'Sair' }).click()
  await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible()

  await page.getByRole('link', { name: 'Entrar' }).click()
  await page.getByLabel('CPF', { exact: true }).fill(cpf)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Senha', { exact: true }).fill('senha-nova-1')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('button', { name: /minha conta/i })).toBeVisible()
})

test('esqueci minha senha troca a senha pelo código', async ({ page }) => {
  await page.goto('/entrar')
  const cpf = await signUpNewCustomer(page, randomCpf())
  await page.getByRole('button', { name: /minha conta/i }).click()
  await page.getByRole('menuitem', { name: 'Sair' }).click()
  await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible()
  await page.goto('/entrar')
  await page.getByLabel('CPF', { exact: true }).fill(cpf)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click()
  await page.getByLabel('Código').fill('000000')
  await page.getByLabel('Nova senha').fill('senha-trocada-1')
  await page.getByLabel('Confirmar senha').fill('senha-trocada-1')
  await page.getByRole('button', { name: 'Criar senha e entrar' }).click()
  await expect(page.getByRole('button', { name: /minha conta/i })).toBeVisible()
})
