import { expect, test, type Page } from '@playwright/test'

async function signIn(page: Page, login = 'admin', password = 'senha-e2e-segura') {
  await page.getByLabel('Usuário').fill(login)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

async function openMenu(page: Page) {
  const toggle = page.getByRole('button', { name: 'Abrir menu' })
  if (await toggle.isVisible()) await toggle.click()
}

test('protege o painel, faz login e volta à página pedida', async ({ page }) => {
  await page.goto('/admin/usuarios')
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fusuarios/)

  await signIn(page, 'admin', 'senha-errada-000')
  await expect(page.getByText('Usuário ou senha inválidos.')).toBeVisible()

  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Usuários do sistema' })).toBeVisible()

  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/admin\/login/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login/)
})

test('cria, edita e exclui um usuário do painel', async ({ page }, testInfo) => {
  const login = `operador-${testInfo.project.name}`
  await page.goto('/admin/login')
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await openMenu(page)
  await page.getByRole('link', { name: 'Usuários do sistema' }).click()

  await page.getByRole('button', { name: 'Novo usuário' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Novo usuário' })
  await createDialog.getByLabel('Nome').fill('Operador E2E')
  await createDialog.getByLabel('Login').fill(login)
  await createDialog.getByLabel('Senha').fill('senha-operador-123')
  await createDialog.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText(login, { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Editar Operador E2E' }).click()
  const editDialog = page.getByRole('dialog', { name: 'Editar usuário' })
  await editDialog.getByLabel('Nome').fill('Operador Editado')
  await editDialog.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Operador Editado')).toBeVisible()

  await page.getByRole('button', { name: 'Excluir Operador Editado' }).click()
  await page
    .getByRole('dialog', { name: 'Excluir usuário' })
    .getByRole('button', { name: 'Excluir' })
    .click()
  await expect(page.getByText(login, { exact: true })).toBeHidden()
})
