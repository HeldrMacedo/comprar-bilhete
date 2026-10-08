import { expect, test, type Page } from '@playwright/test'

async function signIn(page: Page, path: string) {
  await page.goto(path)
  await page.getByLabel('Usuário').fill('admin')
  await page.getByLabel('Senha').fill('senha-e2e-segura')
  await page.getByRole('button', { name: 'Entrar' }).click()
}

test('edita prêmio do sorteio e a Home mostra a mudança', async ({ page }, testInfo) => {
  const prize = `BICICLETA ${testInfo.project.name.toUpperCase()}`
  await signIn(page, '/admin/sorteios')

  const sunday = page.getByRole('article', { name: /Sorteio de domingo/ })
  await sunday.getByLabel('5º prêmio').fill(prize)
  // Datas futuras: o backend do E2E é compartilhado e outras jornadas compram neste sorteio.
  // Um domingo diferente por projeto: a data sempre muda (pede confirmação) e o botão da Home
  // continua "Domingo", pois leva o dia da semana do sorteio.
  const day = testInfo.project.name === 'mobile' ? '2031-01-05' : '2030-12-29'
  await sunday.getByLabel('Fim das vendas').fill(`${day}T19:00`)
  await sunday.getByLabel('Data do sorteio').fill(day)
  await sunday.getByLabel('Hora do sorteio').fill('20:00')
  await sunday.getByRole('button', { name: 'Salvar alterações' }).click()
  const confirm = page.getByRole('dialog', { name: 'Confirmar alteração de valor ou datas' })
  await expect(confirm.getByText(/Fim das vendas:/)).toBeVisible()
  await confirm.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Sorteio #sorteio-domingo atualizado.')).toBeVisible()

  await page.goto('/')
  await page
    .getByRole('group', { name: 'Sorteios disponíveis' })
    .getByRole('button', { name: 'Domingo', exact: true })
    .click()
  await expect(page.getByText(prize).first()).toBeVisible()
})

test('pede confirmação ao mudar o valor do bilhete', async ({ page }) => {
  await signIn(page, '/admin/sorteios')
  const wednesday = page.getByRole('article', { name: /Sorteio de quarta/ })
  await wednesday.getByLabel('Valor do bilhete (R$)').fill('12,00')
  await wednesday.getByRole('button', { name: 'Salvar alterações' }).click()

  const dialog = page.getByRole('dialog', { name: 'Confirmar alteração de valor ou datas' })
  await expect(dialog.getByText(/R\$\s10,00 → R\$\s12,00/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Voltar' }).click()
  await wednesday.getByRole('button', { name: 'Desfazer' }).click()
  await expect(wednesday.getByLabel('Valor do bilhete (R$)')).toHaveValue('10,00')
})

test('configura o vídeo do YouTube exibido na Home', async ({ page }) => {
  await signIn(page, '/admin/configuracoes')
  await page.getByLabel('Link do vídeo').fill('https://youtu.be/dQw4w9WgXcQ')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Vídeo salvo. Ele já aparece na página inicial.')).toBeVisible()

  await page.goto('/')
  await page.getByRole('button', { name: 'Reproduzir vídeo do sorteio' }).click()
  await expect(page.getByTitle('Vídeo do sorteio no YouTube')).toHaveAttribute(
    'src',
    /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/,
  )

  await page.goto('/admin/configuracoes')
  await page.getByLabel('Link do vídeo').fill('')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Vídeo removido da página inicial.')).toBeVisible()
})
