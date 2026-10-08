import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AdminOrder,
  AdminUser,
  ContestSlot,
  DashboardSummary,
} from '../../features/admin/domain/types'
import { adminRepository } from '../../features/admin/repository/admin-repository'
import { RequireAdmin } from '../../features/admin/ui/RequireAdmin'
import { AdminCustomersPage } from './AdminCustomersPage'
import { AdminHomePage } from './AdminHomePage'
import { AdminLoginPage } from './AdminLoginPage'
import { AdminRafflesPage } from './AdminRafflesPage'
import { AdminSalesPage } from './AdminSalesPage'
import { AdminSettingsPage } from './AdminSettingsPage'
import { AdminUsersPage } from './AdminUsersPage'

vi.mock('../../features/admin/repository/admin-repository', () => ({
  adminRepository: {
    getSession: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    listUsers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    listOrders: vi.fn(),
    runOrderAction: vi.fn(),
    exportOrders: vi.fn(),
    listCustomers: vi.fn(),
    exportCustomers: vi.fn(),
    getDashboard: vi.fn(),
    listRaffles: vi.fn(),
    updateRaffle: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
}))

const repository = vi.mocked(adminRepository)

const admin: AdminUser = {
  id: '00000000-0000-4000-8000-000000000001',
  login: 'admin',
  name: 'Administrador',
  active: true,
  createdAt: '2026-10-08T12:00:00.000Z',
  updatedAt: '2026-10-08T12:00:00.000Z',
}
const maria: AdminUser = {
  ...admin,
  id: '00000000-0000-4000-8000-000000000002',
  login: 'maria',
  name: 'Maria',
}

function renderAdmin(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminHomePage />} />
          <Route path="/admin/vendas" element={<AdminSalesPage />} />
          <Route path="/admin/clientes" element={<AdminCustomersPage />} />
          <Route path="/admin/sorteios" element={<AdminRafflesPage />} />
          <Route path="/admin/configuracoes" element={<AdminSettingsPage />} />
          <Route
            path="/admin/usuarios"
            element={
              <RequireAdmin>
                <AdminUsersPage />
              </RequireAdmin>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('admin access', () => {
  it('redirects to login without a session and returns after signing in', async () => {
    repository.getSession.mockResolvedValue(null)
    repository.login.mockResolvedValue(admin)
    repository.listUsers.mockResolvedValue([admin])
    renderAdmin('/admin/usuarios')

    await userEvent.type(await screen.findByLabelText('Usuário'), 'admin')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-segura-123')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(repository.login).toHaveBeenCalledWith({ login: 'admin', password: 'senha-segura-123' })
    expect(await screen.findByRole('heading', { name: 'Usuários do sistema' })).toBeInTheDocument()
  })

  it('shows the login error message', async () => {
    repository.getSession.mockResolvedValue(null)
    repository.login.mockRejectedValue(new Error('Usuário ou senha inválidos.'))
    renderAdmin('/admin/login')

    await userEvent.type(await screen.findByLabelText('Usuário'), 'admin')
    await userEvent.type(screen.getByLabelText('Senha'), 'errada')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Usuário ou senha inválidos.')).toBeInTheDocument()
  })
})

describe('AdminUsersPage', () => {
  beforeEach(() => {
    repository.getSession.mockResolvedValue(admin)
  })

  it('lists users and hides delete for the current user', async () => {
    repository.listUsers.mockResolvedValue([admin, maria])
    renderAdmin('/admin/usuarios')

    expect(await screen.findByText('Maria')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir Administrador' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Excluir Maria' })).toBeInTheDocument()
  })

  it('validates and creates a user', async () => {
    repository.listUsers.mockResolvedValue([admin])
    repository.createUser.mockResolvedValue(maria)
    renderAdmin('/admin/usuarios')

    await userEvent.click(await screen.findByRole('button', { name: 'Novo usuário' }))
    const dialog = screen.getByRole('dialog', { name: 'Novo usuário' })
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Maria')
    await userEvent.type(within(dialog).getByLabelText('Login'), 'maria')
    await userEvent.type(within(dialog).getByLabelText('Senha'), 'curta')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(
      await within(dialog).findByText('A senha precisa de pelo menos 12 caracteres.'),
    ).toBeInTheDocument()
    expect(repository.createUser).not.toHaveBeenCalled()

    await userEvent.clear(within(dialog).getByLabelText('Senha'))
    await userEvent.type(within(dialog).getByLabelText('Senha'), 'senha-segura-123')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(repository.createUser).toHaveBeenCalledWith({
      login: 'maria',
      name: 'Maria',
      password: 'senha-segura-123',
    })
  })

  it('confirms before deleting and shows server errors', async () => {
    repository.listUsers.mockResolvedValue([admin, maria])
    repository.deleteUser.mockRejectedValue(
      new Error('O painel precisa de pelo menos um administrador ativo.'),
    )
    renderAdmin('/admin/usuarios')

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir Maria' }))
    const dialog = screen.getByRole('dialog', { name: 'Excluir usuário' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    expect(repository.deleteUser).toHaveBeenCalledWith(maria.id)
    expect(
      await within(dialog).findByText('O painel precisa de pelo menos um administrador ativo.'),
    ).toBeInTheDocument()
  })
})

const pendingOrder: AdminOrder = {
  id: '11111111-0000-4000-8000-000000000001',
  status: 'pending',
  createdAt: '2026-10-08T12:00:00.000Z',
  expiresAt: '2026-10-08T12:15:00.000Z',
  totalInCents: 1600,
  customer: { name: 'Maria da Silva', cpf: '52998224725', phone: '84999855367' },
  items: [
    {
      id: 'card-001',
      code: '#001',
      raffleId: 'quarta',
      raffleTitle: 'Sorteio de Quarta',
      unitPriceInCents: 1000,
    },
    {
      id: 'card-002',
      code: '#002',
      raffleId: 'domingo',
      raffleTitle: 'Sorteio de Domingo',
      unitPriceInCents: 600,
    },
  ],
}

describe('AdminSalesPage', () => {
  it('reads filters from the URL, approves with a reason and reports the outcome', async () => {
    repository.listOrders.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      orders: [pendingOrder],
    })
    repository.runOrderAction.mockResolvedValue({
      ...pendingOrder,
      status: 'paid',
      captureMethod: 'manual',
    })
    renderAdmin('/admin/vendas?q=maria&status=pending')

    expect(await screen.findByText('Maria da Silva')).toBeInTheDocument()
    expect(repository.listOrders).toHaveBeenCalledWith(
      { q: 'maria', status: 'pending', from: undefined, to: undefined },
      { page: 1, pageSize: 20 },
      expect.anything(),
    )
    expect(screen.getByText('Sorteio de Quarta: #001')).toBeInTheDocument()
    expect(screen.getByLabelText('Buscar')).toHaveValue('maria')

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar pedido de Maria da Silva' }))
    const dialog = screen.getByRole('dialog', { name: 'Aprovar pagamento manualmente' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aprovar' }))
    expect(within(dialog).getByText('Informe o motivo (mínimo 5 caracteres).')).toBeInTheDocument()
    expect(repository.runOrderAction).not.toHaveBeenCalled()

    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Pix recebido na conta')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aprovar' }))

    expect(repository.runOrderAction).toHaveBeenCalledWith(
      pendingOrder.id,
      'approve',
      'Pix recebido na conta',
    )
    expect(await screen.findByText('Pedido aprovado e bilhetes validados.')).toBeInTheDocument()
  })

  it('never shows manual review as paid and explains a failed delivery', async () => {
    const inReview: AdminOrder = {
      ...pendingOrder,
      status: 'manual_review',
      lastError: 'Falha externa',
    }
    repository.listOrders.mockResolvedValue({ page: 1, pageSize: 20, total: 1, orders: [inReview] })
    repository.runOrderAction.mockResolvedValue(inReview)
    renderAdmin('/admin/vendas')

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Em análise')).toBeInTheDocument()
    expect(within(table).queryByText('Pago')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar pedido de Maria da Silva' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancelar pedido' })
    expect(within(dialog).getByText(/faça o estorno fora do sistema/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }))

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar pedido de Maria da Silva' }))
    const retry = screen.getByRole('dialog', { name: 'Tentar entregar novamente' })
    await userEvent.type(within(retry).getByLabelText('Motivo'), 'Nova tentativa')
    await userEvent.click(within(retry).getByRole('button', { name: 'Aprovar' }))

    expect(
      await screen.findByText(
        'A entrega dos bilhetes falhou e o pedido continua em análise: Falha externa',
      ),
    ).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    repository.listOrders.mockResolvedValue({ page: 1, pageSize: 20, total: 0, orders: [] })
    renderAdmin('/admin/vendas')

    expect(
      await screen.findByText('Nenhuma venda encontrada com esses filtros.'),
    ).toBeInTheDocument()
  })
})

describe('AdminCustomersPage', () => {
  it('lists customers and exports with the current filters', async () => {
    repository.listCustomers.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      customers: [
        {
          cpf: '52998224725',
          name: 'Maria da Silva',
          phone: '84999855367',
          orderCount: 3,
          paidOrderCount: 2,
          paidTotalInCents: 2600,
          ticketCount: 3,
          firstOrderAt: '2026-10-01T12:00:00.000Z',
          lastOrderAt: '2026-10-08T12:00:00.000Z',
        },
      ],
    })
    repository.exportCustomers.mockRejectedValue(new Error('A exportação passa de 20000 clientes.'))
    renderAdmin('/admin/clientes?compra=paid')

    expect(await screen.findByText('2 pagos de 3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }))

    expect(repository.exportCustomers).toHaveBeenCalledWith({
      q: undefined,
      purchase: 'paid',
      from: undefined,
      to: undefined,
    })
    expect(await screen.findByText('A exportação passa de 20000 clientes.')).toBeInTheDocument()
  })
})

const summary: DashboardSummary = {
  generatedAt: '2026-10-08T15:00:00.000Z',
  totals: {
    customers: 12,
    paidTickets: 30,
    paidOrders: 9,
    revenueInCents: 2_550_00,
    pendingTickets: 4,
    pendingOrders: 2,
    manualReviewOrders: 1,
  },
  dailySales: Array.from({ length: 30 }, (_, index) => ({
    day: `2026-09-${String(index + 1).padStart(2, '0')}`,
    revenueInCents: index === 29 ? 1600 : 0,
    tickets: index === 29 ? 2 : 0,
  })),
  ordersByStatus: [
    { status: 'paid', orders: 9 },
    { status: 'manual_review', orders: 1 },
    { status: 'expired', orders: 0 },
  ],
  ticketsByRaffle: [
    { raffleId: 'quarta', raffleTitle: 'Sorteio de Quarta', tickets: 20, revenueInCents: 2000 },
  ],
  upcomingRaffles: [
    {
      id: 'quarta',
      title: 'Sorteio de Quarta',
      drawDate: '2026-10-07T23:00:00.000Z',
      priceInCents: 1000,
      prizes: ['VALE COMPRAS 5 MIL REAIS'],
      paidTickets: 20,
      revenueInCents: 2000,
    },
  ],
}

describe('AdminHomePage', () => {
  it('shows indicators, upcoming raffles, charts and the manual review alert', async () => {
    repository.getDashboard.mockResolvedValue(summary)
    renderAdmin('/admin')

    expect(await screen.findByText('R$ 2.550,00')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Bilhetes pendentes de pagamento' }),
    ).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /1 pedido pago está em análise/ })).toHaveAttribute(
      'href',
      '/admin/vendas?status=manual_review',
    )
    expect(screen.getByRole('heading', { name: 'Sorteio de Quarta', level: 3 })).toBeInTheDocument()
    expect(screen.getByText('VALE COMPRAS 5 MIL REAIS')).toBeInTheDocument()

    const revenueTable = screen.getByRole('table', {
      name: 'Faturamento por dia nos últimos 30 dias',
    })
    expect(
      within(revenueTable).getByRole('rowheader', { name: '30/09' }).nextSibling,
    ).toHaveTextContent('R$ 16,00')
    const statuses = screen.getByRole('list', { name: 'Pedidos por status' })
    expect(within(statuses).getByText('Em análise')).toBeInTheDocument()
    expect(within(statuses).queryByText('Expirado')).not.toBeInTheDocument()
  })

  it('keeps indicators when upcoming raffles are unavailable', async () => {
    repository.getDashboard.mockResolvedValue({
      ...summary,
      upcomingRaffles: null,
      upcomingRafflesError: 'Não foi possível consultar os sorteios na API de bilhetes.',
    })
    renderAdmin('/admin')

    expect(
      await screen.findByText('Não foi possível consultar os sorteios na API de bilhetes.'),
    ).toBeInTheDocument()
    expect(screen.getByText('R$ 2.550,00')).toBeInTheDocument()
  })
})

const contest: ContestSlot = {
  source: 'esp',
  contestId: '2026043',
  salesStartAt: '2026-09-10T12:46',
  salesEndAt: '2026-10-11T08:00',
  drawDate: '2026-10-11',
  drawTime: '09:00',
  priceInCents: 100,
  prizes: ['R$: 3 MIL REAIS', '1 HONDA BROS 160 0KM'],
  luckySpinsCount: 0,
  luckySpinsLabel: '',
  doubleChance: true,
}

describe('AdminRafflesPage', () => {
  it('saves prize changes directly', async () => {
    repository.listRaffles.mockResolvedValue([contest])
    repository.updateRaffle.mockImplementation(async (_source, values) => ({
      ...contest,
      ...values,
    }))
    renderAdmin('/admin/sorteios')

    const prize = await screen.findByLabelText('3º prêmio')
    await userEvent.type(prize, 'MOTO 0KM')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(repository.updateRaffle).toHaveBeenCalledWith(
      'esp',
      expect.objectContaining({
        prizes: ['R$: 3 MIL REAIS', '1 HONDA BROS 160 0KM', 'MOTO 0KM'],
        priceInCents: 100,
      }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('Sorteio #2026043 atualizado.')).toBeInTheDocument()
  })

  it('asks for confirmation before changing the price', async () => {
    repository.listRaffles.mockResolvedValue([contest])
    repository.updateRaffle.mockImplementation(async (_source, values) => ({
      ...contest,
      ...values,
    }))
    renderAdmin('/admin/sorteios')

    const price = await screen.findByLabelText('Valor do bilhete (R$)')
    await userEvent.clear(price)
    await userEvent.type(price, '2,50')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    const dialog = screen.getByRole('dialog', { name: 'Confirmar alteração de valor ou datas' })
    expect(within(dialog).getByText(/R\$\s1,00 → R\$\s2,50/)).toBeInTheDocument()
    expect(repository.updateRaffle).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(repository.updateRaffle).toHaveBeenCalledWith(
      'esp',
      expect.objectContaining({ priceInCents: 250 }),
    )
  })

  it('validates the sales window against the draw time', async () => {
    repository.listRaffles.mockResolvedValue([contest])
    renderAdmin('/admin/sorteios')

    const end = await screen.findByLabelText('Fim das vendas')
    await userEvent.clear(end)
    await userEvent.type(end, '2026-10-11T10:00')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(
      await screen.findByText('As vendas precisam terminar até o horário do sorteio.'),
    ).toBeInTheDocument()
    expect(repository.updateRaffle).not.toHaveBeenCalled()
  })
})

describe('AdminSettingsPage', () => {
  it('saves the YouTube link and shows server validation errors', async () => {
    repository.getSettings.mockResolvedValue({ youtubeVideoId: null, youtubeUrl: '' })
    repository.updateSettings
      .mockRejectedValueOnce(
        new Error('Informe um link de vídeo do YouTube (youtube.com ou youtu.be).'),
      )
      .mockResolvedValueOnce({
        youtubeVideoId: 'dQw4w9WgXcQ',
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      })
    renderAdmin('/admin/configuracoes')

    const input = await screen.findByLabelText('Link do vídeo')
    await userEvent.type(input, 'https://vimeo.com/1')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(
      await screen.findByText('Informe um link de vídeo do YouTube (youtube.com ou youtu.be).'),
    ).toBeInTheDocument()

    await userEvent.clear(input)
    await userEvent.type(input, 'https://youtu.be/dQw4w9WgXcQ')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(repository.updateSettings).toHaveBeenLastCalledWith('https://youtu.be/dQw4w9WgXcQ')
    expect(
      await screen.findByText('Vídeo salvo. Ele já aparece na página inicial.'),
    ).toBeInTheDocument()
    expect(screen.getByAltText('Miniatura do vídeo configurado')).toHaveAttribute(
      'src',
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    )
  })
})
