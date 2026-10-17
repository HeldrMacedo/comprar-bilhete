import { expect, type Page } from '@playwright/test'

// CPF válido e aleatório: cada cadastro do E2E usa um CPF que o servidor ainda não conhece.
export function randomCpf() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10))
  const digit = (numbers: number[]) => {
    const sum = numbers.reduce(
      (total, value, index) => total + value * (numbers.length + 1 - index),
      0,
    )
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  const first = digit(base)
  return [...base, first, digit([...base, first])].join('')
}

// Maria existe no mock da API com e-mail. O servidor do E2E é compartilhado entre testes e
// projetos: na primeira vez ela faz o primeiro acesso; nas seguintes, entra com a senha criada.
export async function signInAsMaria(page: Page) {
  await page.getByLabel('CPF', { exact: true }).fill('52998224725')
  await page.getByRole('button', { name: 'Continuar' }).click()
  const password = page.getByLabel('Senha', { exact: true })
  const sendCode = page.getByRole('button', { name: 'Enviar código' })
  await expect(password.or(sendCode)).toBeVisible()
  if (await sendCode.isVisible()) {
    await sendCode.click()
    await page.getByLabel('Código').fill('000000')
    await page.getByLabel('Nova senha').fill('senha-maria-1')
    await page.getByLabel('Confirmar senha').fill('senha-maria-1')
    await page.getByRole('button', { name: 'Criar senha e entrar' }).click()
    return
  }
  await password.fill('senha-maria-1')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

// Cadastro novo pelo fluxo de CPF; com e-mail mock, o código é sempre 000000.
export async function signUpNewCustomer(page: Page, cpf = randomCpf()) {
  await page.getByLabel('CPF', { exact: true }).fill(cpf)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Nome completo').fill('Cliente Novo')
  await page.getByLabel('Celular com DDD').fill('84999998888')
  await page.getByLabel('Email').fill(`cliente-${cpf}@example.com`)
  await page.getByLabel('CEP').fill('59062300')
  await page.getByLabel('Endereco').fill('Avenida Lima e Silva')
  await page.getByLabel('Numero').fill('129')
  await page.getByLabel('Bairro').fill('Nazare')
  await page.getByLabel('Cidade').fill('Natal')
  await page.getByLabel('UF').fill('RN')
  await page.getByLabel('Senha', { exact: true }).fill('senha-nova-1')
  await page.getByLabel('Confirmar senha').fill('senha-nova-1')
  await page.getByRole('button', { name: 'Enviar código' }).click()
  await page.getByLabel('Código').fill('000000')
  await page.getByRole('button', { name: 'Confirmar e entrar' }).click()
  return cpf
}
