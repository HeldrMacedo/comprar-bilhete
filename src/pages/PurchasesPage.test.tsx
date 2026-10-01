import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppLayout } from '../app/AppLayout'
import { CartProvider } from '../features/cart/runtime/CartProvider'
import type { Purchase } from '../features/purchases/domain/types'
import { purchaseRepository } from '../features/purchases/repository/purchase-repository'
import { createReceiptFiles, shareReceipts } from '../features/purchases/runtime/share-receipt'
import { PurchasesPage } from './PurchasesPage'

vi.mock('../features/purchases/repository/purchase-repository', () => ({
  purchaseRepository: { lookupByCpf: vi.fn() },
}))

vi.mock('../features/purchases/runtime/share-receipt', () => ({
  createReceiptFiles: vi.fn(),
  shareReceipts: vi.fn(),
}))

const paid: Purchase = {
  id: '11111111-0000-4000-8000-000000000001',
  status: 'paid',
  totalInCents: 1600,
  paymentMethod: 'pix',
  createdAt: '2026-09-27T13:05:00.000Z',
  paidAt: '2026-09-27T13:07:00.000Z',
  receiptUrl: 'https://recibo.example/1',
  items: [
    {
      id: 'card-001',
      code: '#001',
      numbers: [1, 14, 27],
      secondChanceNumbers: [5, 30, 42],
      raffleId: 'quarta',
      raffleTitle: 'Sorteio de Quarta',
      unitPriceInCents: 1000,
    },
  ],
}

const inReview: Purchase = {
  ...paid,
  id: '22222222-0000-4000-8000-000000000002',
  status: 'manual_review',
  message: 'Pagamento recebido. Estamos confirmando suas cartelas manualmente.',
  receiptUrl: undefined,
}

const pending: Purchase = {
  ...paid,
  id: '33333333-0000-4000-8000-000000000003',
  status: 'pending',
  paidAt: undefined,
  paymentMethod: undefined,
  receiptUrl: undefined,
  checkoutUrl: 'https://checkout.example/3',
}

function renderApp(initialEntry: string | { pathname: string; state?: unknown } = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <CartProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<p>Início</p>} />
              <Route path="minhas-compras" element={<PurchasesPage />} />
            </Route>
          </Routes>
        </CartProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('PurchasesPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(cleanup)

  it('abre Minhas compras pelo CPF digitado no cabeçalho', async () => {
    vi.mocked(purchaseRepository.lookupByCpf).mockResolvedValue([paid])
    renderApp()

    await userEvent.type(screen.getByLabelText('CPF para consultar compras'), '52998224725')
    await userEvent.click(screen.getByRole('button', { name: /minhas compras/i }))

    const card = await screen.findByRole('article', { name: '11111111' })
    expect(purchaseRepository.lookupByCpf).toHaveBeenCalledWith('52998224725', expect.anything())
    expect(within(card).getByText('Pago')).toBeVisible()
    expect(within(card).getByText('R$ 16,00')).toBeVisible()
    expect(within(card).getByText('Pix')).toBeVisible()
    expect(within(card).getByText('Cartela #001')).toBeVisible()
    expect(within(card).getByLabelText('Dezenas da cartela #001 (1ª chance)')).toHaveTextContent(
      '011427',
    )
    expect(within(card).getByLabelText('Dezenas da cartela #001 (2ª chance)')).toHaveTextContent(
      '053042',
    )
    expect(within(card).getByRole('link', { name: /ver comprovante/i })).toHaveAttribute(
      'href',
      'https://recibo.example/1',
    )
    expect(screen.getByLabelText('CPF do comprador')).toHaveValue('529.982.247-25')
  })

  it('pede o CPF quando a página é aberta sem ele e valida o dígito', async () => {
    renderApp('/minhas-compras')

    await userEvent.type(screen.getByLabelText('CPF do comprador'), '11111111111')
    await userEvent.click(screen.getByRole('button', { name: 'Consultar' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Informe um CPF valido.')
    expect(purchaseRepository.lookupByCpf).not.toHaveBeenCalled()
  })

  it('não mostra análise manual como sucesso e oferece pagamento do pedido pendente', async () => {
    vi.mocked(purchaseRepository.lookupByCpf).mockResolvedValue([inReview, pending])
    renderApp({ pathname: '/minhas-compras', state: { cpf: '52998224725' } })

    const review = await screen.findByRole('article', { name: '22222222' })
    expect(within(review).getByText('Em análise')).toBeVisible()
    expect(within(review).queryByText('Pago')).not.toBeInTheDocument()

    const waiting = screen.getByRole('article', { name: '33333333' })
    expect(within(waiting).getByText('Aguardando pagamento')).toBeVisible()
    expect(within(waiting).getByText('Não realizado')).toBeVisible()
    expect(within(waiting).getByRole('link', { name: 'Pagar agora' })).toHaveAttribute(
      'href',
      'https://checkout.example/3',
    )
  })

  it('compartilha no WhatsApp o comprovante de cada cartela do pedido pago', async () => {
    const second = { ...paid.items![0]!, id: 'card-002', code: '#002' }
    const order: Purchase = { ...paid, items: [...paid.items!, second] }
    const files = [new File(['png'], 'bilhete-001.png'), new File(['png'], 'bilhete-002.png')]
    vi.mocked(purchaseRepository.lookupByCpf).mockResolvedValue([order])
    vi.mocked(createReceiptFiles).mockResolvedValue(files)
    vi.mocked(shareReceipts).mockResolvedValue('shared')
    renderApp({ pathname: '/minhas-compras', state: { cpf: '52998224725' } })

    const card = await screen.findByRole('article', { name: '11111111' })
    await userEvent.click(within(card).getByRole('button', { name: /compartilhar no whatsapp/i }))

    expect(createReceiptFiles).toHaveBeenCalledWith(order, order.items)
    expect(shareReceipts).toHaveBeenCalledWith(files)

    await userEvent.click(
      within(card).getByRole('button', { name: 'Compartilhar cartela #002 no WhatsApp' }),
    )
    expect(createReceiptFiles).toHaveBeenLastCalledWith(order, [second])
  })

  it('avisa quando as imagens foram baixadas em vez de compartilhadas', async () => {
    vi.mocked(purchaseRepository.lookupByCpf).mockResolvedValue([paid])
    vi.mocked(createReceiptFiles).mockResolvedValue([new File(['png'], 'bilhete-001.png')])
    vi.mocked(shareReceipts).mockResolvedValue('downloaded')
    renderApp({ pathname: '/minhas-compras', state: { cpf: '52998224725' } })

    const card = await screen.findByRole('article', { name: '11111111' })
    await userEvent.click(within(card).getByRole('button', { name: /compartilhar no whatsapp/i }))

    expect(await within(card).findByRole('status')).toHaveTextContent(
      'Comprovantes salvos. Anexe no WhatsApp.',
    )
  })

  it('mantém as imagens prontas quando o navegador exige novo toque para compartilhar', async () => {
    const files = [new File(['png'], 'bilhete-001.png')]
    vi.mocked(purchaseRepository.lookupByCpf).mockResolvedValue([paid])
    vi.mocked(createReceiptFiles).mockResolvedValue(files)
    vi.mocked(shareReceipts)
      .mockRejectedValueOnce(new DOMException('sem gesto', 'NotAllowedError'))
      .mockResolvedValueOnce('shared')
    renderApp({ pathname: '/minhas-compras', state: { cpf: '52998224725' } })

    const card = await screen.findByRole('article', { name: '11111111' })
    const button = within(card).getByRole('button', { name: /compartilhar no whatsapp/i })
    await userEvent.click(button)
    expect(await within(card).findByRole('status')).toHaveTextContent('Toque de novo')

    await userEvent.click(button)
    expect(createReceiptFiles).toHaveBeenCalledTimes(1)
    expect(shareReceipts).toHaveBeenLastCalledWith(files)
  })

  it('não oferece comprovante para pedido em análise ou pendente', async () => {
    vi.mocked(purchaseRepository.lookupByCpf).mockResolvedValue([inReview, pending])
    renderApp({ pathname: '/minhas-compras', state: { cpf: '52998224725' } })

    await screen.findByRole('article', { name: '22222222' })
    expect(screen.queryByRole('button', { name: /compartilhar/i })).not.toBeInTheDocument()
  })

  it('informa quando o CPF não tem compras', async () => {
    vi.mocked(purchaseRepository.lookupByCpf).mockResolvedValue([])
    renderApp({ pathname: '/minhas-compras', state: { cpf: '11144477735' } })

    expect(await screen.findByRole('heading', { name: 'Nenhuma compra encontrada' })).toBeVisible()
  })
})
