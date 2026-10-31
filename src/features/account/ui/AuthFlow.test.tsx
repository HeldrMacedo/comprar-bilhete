import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/api/http-client'
import { accountRepository } from '../repository/account-repository'
import { AuthFlow } from './AuthFlow'
import { CodeStep } from './CodeStep'

vi.mock('../repository/account-repository', () => ({
  accountRepository: {
    getMe: vi.fn(),
    identify: vi.fn(),
    requestCode: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    setPassword: vi.fn(),
    updateProfile: vi.fn(),
    logout: vi.fn(),
    lookupZipCode: vi.fn(),
  },
}))

const account = {
  cpf: '52998224725',
  name: 'Maria da Silva',
  email: 'maria@example.com',
  phone: '84999855367',
  complete: true,
}

function renderFlow(onAuthenticated = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthFlow onAuthenticated={onAuthenticated} />
    </QueryClientProvider>,
  )
  return onAuthenticated
}

async function typeCpf(cpf: string) {
  await userEvent.type(screen.getByLabelText('CPF', { exact: true }), cpf)
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
}

async function fillSignup() {
  await userEvent.type(await screen.findByLabelText('Nome completo'), 'Cliente Novo')
  await userEvent.type(screen.getByLabelText('Celular com DDD'), '84999998888')
  await userEvent.type(screen.getByLabelText('Email'), 'novo@example.com')
  await userEvent.type(screen.getByLabelText('CEP'), '59062300')
  await userEvent.type(screen.getByLabelText('Endereco'), 'Avenida Lima e Silva')
  await userEvent.type(screen.getByLabelText('Numero'), '129')
  await userEvent.type(screen.getByLabelText('Bairro'), 'Nazare')
  await userEvent.type(screen.getByLabelText('Cidade'), 'Natal')
  await userEvent.type(screen.getByLabelText('UF'), 'RN')
  await userEvent.type(screen.getByLabelText('Senha'), 'senha-nova-1')
  await userEvent.type(screen.getByLabelText('Confirmar senha'), 'senha-nova-1')
}

describe('AuthFlow', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('entra com senha quando o CPF tem conta', async () => {
    vi.mocked(accountRepository.identify).mockResolvedValue({ status: 'account' })
    vi.mocked(accountRepository.login).mockResolvedValue(account)
    const onAuthenticated = renderFlow()
    await typeCpf('52998224725')
    await userEvent.type(await screen.findByLabelText('Senha'), 'senha-maria-1')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(accountRepository.login).toHaveBeenCalledWith('52998224725', 'senha-maria-1')
    expect(onAuthenticated).toHaveBeenCalledWith(account)
  })

  it('primeiro acesso mostra o e-mail mascarado e cria senha com o código', async () => {
    vi.mocked(accountRepository.identify).mockResolvedValue({
      status: 'first_access',
      maskedEmail: 'ma***@example.com',
    })
    vi.mocked(accountRepository.requestCode).mockResolvedValue()
    vi.mocked(accountRepository.setPassword).mockResolvedValue(account)
    const onAuthenticated = renderFlow()
    await typeCpf('52998224725')
    expect(await screen.findByText(/ma\*\*\*@example\.com/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
    await userEvent.type(await screen.findByLabelText('Código'), '000000')
    await userEvent.type(screen.getByLabelText('Nova senha'), 'senha-maria-1')
    await userEvent.type(screen.getByLabelText('Confirmar senha'), 'senha-maria-1')
    await userEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }))
    expect(accountRepository.setPassword).toHaveBeenCalledWith({
      cpf: '52998224725',
      code: '000000',
      password: 'senha-maria-1',
    })
    expect(onAuthenticated).toHaveBeenCalledWith(account)
  })

  it('CPF sem e-mail mostra orientação', async () => {
    vi.mocked(accountRepository.identify).mockResolvedValue({ status: 'no_email' })
    renderFlow()
    await typeCpf('39053344705')
    expect(await screen.findByText(/procure o suporte para incluir/i)).toBeVisible()
  })

  it('CPF novo preenche cadastro e entra sem código', async () => {
    vi.mocked(accountRepository.identify).mockResolvedValue({ status: 'new' })
    vi.mocked(accountRepository.register).mockResolvedValue({ ...account, cpf: '11144477735' })
    const onAuthenticated = renderFlow()
    await typeCpf('11144477735')
    await userEvent.type(await screen.findByLabelText('Nome completo'), 'Cliente Novo')
    await userEvent.type(screen.getByLabelText('Celular com DDD'), '84999998888')
    await userEvent.type(screen.getByLabelText('Email'), 'novo@example.com')
    await userEvent.type(screen.getByLabelText('CEP'), '59062300')
    await userEvent.type(screen.getByLabelText('Endereco'), 'Avenida Lima e Silva')
    await userEvent.type(screen.getByLabelText('Numero'), '129')
    await userEvent.type(screen.getByLabelText('Bairro'), 'Nazare')
    await userEvent.type(screen.getByLabelText('Cidade'), 'Natal')
    await userEvent.type(screen.getByLabelText('UF'), 'RN')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-nova-1')
    await userEvent.type(screen.getByLabelText('Confirmar senha'), 'senha-nova-1')
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta e entrar' }))
    expect(accountRepository.register).toHaveBeenCalledWith({
      password: 'senha-nova-1',
      customer: expect.objectContaining({ cpf: '11144477735', email: 'novo@example.com' }),
    })
    expect(accountRepository.requestCode).not.toHaveBeenCalled()
    expect(onAuthenticated).toHaveBeenCalled()
  })

  it('CEP preenche o endereço e o cadastro segue sem e-mail', async () => {
    vi.mocked(accountRepository.identify).mockResolvedValue({ status: 'new' })
    vi.mocked(accountRepository.lookupZipCode).mockResolvedValue({
      zipCode: '59062300',
      street: 'Avenida Lima e Silva',
      neighborhood: 'Nossa Senhora de Nazaré',
      city: 'Natal',
      state: 'RN',
    })
    vi.mocked(accountRepository.register).mockResolvedValue({ ...account, cpf: '11144477735' })
    renderFlow()
    await typeCpf('11144477735')
    await userEvent.type(await screen.findByLabelText('Nome completo'), 'Cliente Novo')
    await userEvent.type(screen.getByLabelText('Celular com DDD'), '84999998888')
    await userEvent.type(screen.getByLabelText('CEP'), '59062300')

    expect(screen.getByLabelText('CEP')).toHaveValue('59062-300')
    expect(await screen.findByDisplayValue('AVENIDA LIMA E SILVA')).toBeInTheDocument()
    expect(screen.getByLabelText('Bairro')).toHaveValue('NOSSA SENHORA DE NAZARÉ')
    expect(screen.getByLabelText('Cidade')).toHaveValue('NATAL')
    expect(screen.getByLabelText('UF')).toHaveValue('RN')
    expect(screen.getByLabelText('Numero')).toHaveFocus()
    expect(accountRepository.lookupZipCode).toHaveBeenCalledTimes(1)

    await userEvent.type(screen.getByLabelText('Numero'), '129')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-nova-1')
    await userEvent.type(screen.getByLabelText('Confirmar senha'), 'senha-nova-1')
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta e entrar' }))
    expect(accountRepository.register).toHaveBeenCalledWith({
      password: 'senha-nova-1',
      customer: expect.objectContaining({
        email: null,
        address: expect.objectContaining({ zipCode: '59062300', number: '129', city: 'NATAL' }),
      }),
    })
  })

  it('sem CEP o endereço é digitado à mão; CEP não encontrado só avisa', async () => {
    vi.mocked(accountRepository.identify).mockResolvedValue({ status: 'new' })
    vi.mocked(accountRepository.lookupZipCode).mockResolvedValue(null)
    vi.mocked(accountRepository.register).mockResolvedValue({ ...account, cpf: '11144477735' })
    renderFlow()
    await typeCpf('11144477735')
    await userEvent.type(await screen.findByLabelText('CEP'), '99999999')
    expect(await screen.findByText('CEP não encontrado. Preencha o endereço.')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('CEP'))

    await userEvent.type(screen.getByLabelText('Nome completo'), 'Cliente Novo')
    await userEvent.type(screen.getByLabelText('Celular com DDD'), '84999998888')
    await userEvent.type(screen.getByLabelText('Endereco'), 'Rua A')
    await userEvent.type(screen.getByLabelText('Numero'), '10')
    await userEvent.type(screen.getByLabelText('Bairro'), 'Centro')
    await userEvent.type(screen.getByLabelText('Cidade'), 'Natal')
    await userEvent.type(screen.getByLabelText('UF'), 'RN')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-nova-1')
    await userEvent.type(screen.getByLabelText('Confirmar senha'), 'senha-nova-1')
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta e entrar' }))
    expect(accountRepository.register).toHaveBeenCalledWith({
      password: 'senha-nova-1',
      customer: expect.objectContaining({
        email: null,
        address: expect.objectContaining({ zipCode: undefined, street: 'RUA A' }),
      }),
    })
  })

  it('CPF sem e-mail cria senha com o código do atendimento e o e-mail informado', async () => {
    vi.mocked(accountRepository.identify).mockResolvedValue({ status: 'no_email' })
    vi.mocked(accountRepository.setPassword).mockResolvedValue(account)
    const onAuthenticated = renderFlow()
    await typeCpf('39053344705')
    await userEvent.type(await screen.findByLabelText('Código'), '482913')
    await userEvent.type(screen.getByLabelText('E-mail'), 'Cliente@Example.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-cliente-1')
    await userEvent.type(screen.getByLabelText('Confirmar senha'), 'senha-cliente-1')
    await userEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }))
    expect(accountRepository.setPassword).toHaveBeenCalledWith({
      cpf: '39053344705',
      code: '482913',
      password: 'senha-cliente-1',
      email: 'cliente@example.com',
    })
    expect(onAuthenticated).toHaveBeenCalledWith(account)
  })

  it('esqueci minha senha envia código de recuperação e cria nova senha', async () => {
    vi.mocked(accountRepository.identify).mockResolvedValue({ status: 'account' })
    vi.mocked(accountRepository.requestCode).mockResolvedValue()
    vi.mocked(accountRepository.setPassword).mockResolvedValue(account)
    const onAuthenticated = renderFlow()
    await typeCpf('52998224725')
    await userEvent.click(await screen.findByRole('button', { name: 'Esqueci minha senha' }))
    expect(accountRepository.requestCode).toHaveBeenCalledWith({
      purpose: 'reset',
      cpf: '52998224725',
    })
    expect(await screen.findByRole('button', { name: 'Reenviar código' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Código'), '000000')
    await userEvent.type(screen.getByLabelText('Nova senha'), 'senha-maria-2')
    await userEvent.type(screen.getByLabelText('Confirmar senha'), 'senha-maria-2')
    await userEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }))
    expect(accountRepository.setPassword).toHaveBeenCalledWith({
      cpf: '52998224725',
      code: '000000',
      password: 'senha-maria-2',
    })
    expect(onAuthenticated).toHaveBeenCalledWith(account)
  })

  it('mostra o erro de senha inválida e permite trocar o CPF', async () => {
    vi.mocked(accountRepository.identify).mockResolvedValue({ status: 'account' })
    vi.mocked(accountRepository.login).mockRejectedValue(
      new ApiError('CPF ou senha inválidos.', 401, 'INVALID_CREDENTIALS'),
    )
    const onAuthenticated = renderFlow()
    await typeCpf('52998224725')
    await userEvent.type(await screen.findByLabelText('Senha'), 'senha-errada')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('CPF ou senha inválidos.')
    expect(onAuthenticated).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Trocar CPF' }))
    expect(screen.getByLabelText('CPF', { exact: true })).toHaveValue('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('cadastro com CPF que já tem conta volta para o CPF com a mensagem', async () => {
    vi.mocked(accountRepository.identify).mockResolvedValue({ status: 'new' })
    vi.mocked(accountRepository.register).mockRejectedValue(
      new ApiError(
        'Este CPF já tem cadastro. Entre com sua senha ou recupere o acesso.',
        409,
        'ACCOUNT_EXISTS',
      ),
    )
    renderFlow()
    await typeCpf('11144477735')
    await fillSignup()
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta e entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Este CPF já tem cadastro.')
    expect(screen.getByLabelText('CPF', { exact: true })).toHaveValue('111.444.777-35')
  })

  it('leva o foco ao título de cada nova etapa', async () => {
    vi.mocked(accountRepository.identify).mockResolvedValue({ status: 'account' })
    renderFlow()
    await typeCpf('52998224725')
    expect(await screen.findByRole('heading', { name: 'Digite sua senha' })).toHaveFocus()
  })
})

describe('CodeStep', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('libera o reenvio após 60 s e reinicia a contagem quando o código é reenviado', async () => {
    vi.useFakeTimers()
    const onResend = vi.fn().mockResolvedValue(true)
    render(
      <CodeStep
        submitLabel="Confirmar e entrar"
        busy={false}
        onSubmit={vi.fn()}
        onResend={onResend}
      />,
    )
    const resend = screen.getByRole('button', { name: 'Reenviar código' })
    expect(resend).toBeDisabled()
    act(() => vi.advanceTimersByTime(59_000))
    expect(resend).toBeDisabled()
    expect(screen.getByText('Você pode pedir outro código em 1 s.')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1_000))
    expect(resend).toBeEnabled()
    await act(async () => {
      fireEvent.click(resend)
    })
    expect(onResend).toHaveBeenCalledTimes(1)
    expect(resend).toBeDisabled()
  })
})
