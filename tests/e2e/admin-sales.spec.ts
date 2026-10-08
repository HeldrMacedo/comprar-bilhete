import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const buyer = { name: 'João Souza', cpf: '98765432100', phone: '84988887777' }

// O backend do E2E é compartilhado: outras jornadas vendem e reservam bilhetes. Tenta do fim
// da lista disponível até conseguir reservar e devolve o bilhete usado.
async function createPendingOrder(page: Page) {
  const response = await page.request.get('/api/v1/raffles/sorteio-setembro/cards')
  const cards = ((await response.json()) as Array<{ id: string }>).reverse()
  for (const { id } of cards) {
    const created = await page.request.post('/api/v1/orders', {
      data: {
        raffleId: 'sorteio-setembro',
        selection: { mode: 'manual', cardIds: [id] },
        customer: {
          ...buyer,
          address: {
            zipCode: '59000000',
            street: 'RUA A',
            number: '10',
            neighborhood: 'CENTRO',
            city: 'NATAL',
            state: 'RN',
          },
        },
      },
    })
    if (created.status() === 201) return id
    expect(created.status(), await created.text()).toBe(409)
  }
  throw new Error('Nenhum bilhete livre para o teste.')
}

async function signIn(page: Page, path: string) {
  await page.goto(path)
  await page.getByLabel('Usuário').fill('admin')
  await page.getByLabel('Senha').fill('senha-e2e-segura')
  await page.getByRole('button', { name: 'Entrar' }).click()
}

test('aprova e cancela pedidos pendentes e exporta as vendas', async ({ page }) => {
  const cards = [await createPendingOrder(page), await createPendingOrder(page)]

  await signIn(page, '/admin/vendas?status=pending')
  await expect(page.getByRole('heading', { name: 'Vendas' })).toBeVisible()
  const search = page.getByRole('search', { name: 'Filtrar vendas' })
  await search.getByLabel('Buscar').fill(cards[0]!.replace('card-', '#'))
  await search.getByRole('button', { name: 'Filtrar' }).click()
  await expect(page.getByText(`: ${cards[0]!.replace('card-', '#')}`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Aprovar pedido de João Souza' })).toHaveCount(1)

  await page.getByRole('button', { name: 'Aprovar pedido de João Souza' }).click()
  const approve = page.getByRole('dialog', { name: 'Aprovar pagamento manualmente' })
  await approve.getByLabel('Motivo').fill('Pix recebido direto na conta')
  await approve.getByRole('button', { name: 'Aprovar' }).click()
  await expect(page.getByText('Pedido aprovado e bilhetes validados.')).toBeVisible()

  await search.getByLabel('Buscar').fill(cards[1]!.replace('card-', '#'))
  await search.getByRole('button', { name: 'Filtrar' }).click()
  await expect(page.getByText(`: ${cards[1]!.replace('card-', '#')}`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancelar pedido de João Souza' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Cancelar pedido de João Souza' }).click()
  const cancel = page.getByRole('dialog', { name: 'Cancelar pedido' })
  await cancel.getByLabel('Motivo').fill('Cliente desistiu')
  await cancel.getByRole('button', { name: 'Cancelar pedido' }).click()
  await expect(page.getByText('Pedido cancelado.')).toBeVisible()

  await page.goto('/admin/vendas')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar CSV' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^vendas-\d{4}-\d{2}-\d{2}\.csv$/)
  const csv = await readFile((await download.path())!, 'utf8')
  expect(csv).toContain('Pedido;Data;Status;Cliente;CPF')
  expect(csv).toContain(';Pago;João Souza;98765432100;')
  expect(csv).toContain(';Cancelado;João Souza;98765432100;')
})

test('lista clientes agrupados por CPF', async ({ page }) => {
  await createPendingOrder(page)
  await signIn(page, '/admin/clientes')

  const search = page.getByRole('search', { name: 'Filtrar clientes' })
  await search.getByLabel('Buscar').fill('987.654.321-00')
  await search.getByRole('button', { name: 'Filtrar' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.getByText('João Souza')).toBeVisible()
  await expect(page.getByText('NATAL/RN')).toBeVisible()
})

test('mostra indicadores e gráficos no dashboard', async ({ page }) => {
  await signIn(page, '/admin')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Faturamento total' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Próximos sorteios' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sorteio Especial de Setembro' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Faturamento por dia' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Pedidos por status' })).toBeVisible()
})
