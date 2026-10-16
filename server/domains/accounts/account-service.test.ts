import { describe, expect, it } from 'vitest'
import { createDatabase } from '../../shared/database.js'
import { MockCustomerGateway } from '../customers/mock-customer-gateway.js'
import { AccountRepository } from './account-repository.js'
import { AccountService } from './account-service.js'
import { MockMailGateway } from './mock-mail-gateway.js'
import { VerificationService } from './verification-service.js'

const maria = '52998224725'
const newCpf = '11144477735'
const address = {
  zipCode: '59062300',
  street: 'AVENIDA LIMA E SILVA',
  number: '129',
  neighborhood: 'NAZARE',
  city: 'NATAL',
  state: 'RN',
}

function setup() {
  const repository = new AccountRepository(createDatabase(':memory:'))
  const customers = new MockCustomerGateway()
  const mail = new MockMailGateway()
  const now = () => new Date('2026-10-16T12:00:00.000Z')
  const verification = new VerificationService(repository, mail, now, () => '000000')
  return { service: new AccountService(repository, customers, verification, now), customers, mail }
}

describe('AccountService', () => {
  it('identifica CPF novo, CPF na API com e-mail e CPF sem e-mail', async () => {
    const { service, customers } = setup()
    expect(await service.identify(newCpf)).toEqual({ status: 'new' })
    expect(await service.identify(maria)).toEqual({
      status: 'first_access',
      maskedEmail: 'ma***@example.com',
    })
    await customers.register({
      name: 'Sem Email',
      cpf: '39053344705',
      phone: '84999990000',
      email: null,
      password: 'qualquer1',
    })
    expect(await service.identify('39053344705')).toEqual({ status: 'no_email' })
  })

  it('cadastra CPF novo só com código do e-mail informado e já entra', async () => {
    const { service, mail } = setup()
    await service.requestCode({ purpose: 'signup', cpf: newCpf, email: 'novo@example.com' })
    expect(mail.sent[0]?.to).toBe('novo@example.com')

    const result = await service.register({
      customer: {
        name: 'Cliente Novo',
        cpf: newCpf,
        phone: '84999998888',
        email: 'novo@example.com',
        address,
      },
      password: 'senha-nova-1',
      code: '000000',
    })
    expect(result.account.externalId).toMatch(/^mock-/)
    expect(await service.identify(newCpf)).toEqual({ status: 'account' })
    expect(service.authenticate(result.token)?.account.cpf).toBe(newCpf)
  })

  it('recusa cadastro com e-mail diferente do que recebeu o código', async () => {
    const { service } = setup()
    await service.requestCode({ purpose: 'signup', cpf: newCpf, email: 'novo@example.com' })
    await expect(
      service.register({
        customer: {
          name: 'X Y Z',
          cpf: newCpf,
          phone: '84999998888',
          email: 'outro@example.com',
          address,
        },
        password: 'senha-nova-1',
        code: '000000',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CODE' })
  })

  it('primeiro acesso envia código ao e-mail do cadastro e cria senha', async () => {
    const { service, mail } = setup()
    await service.requestCode({ purpose: 'first_access', cpf: maria })
    expect(mail.sent[0]?.to).toBe('maria@example.com')

    await service.setPassword({ cpf: maria, code: '000000', password: 'senha-maria-1' })
    await expect(service.login(maria, 'senha-maria-1')).resolves.toMatchObject({
      account: { cpf: maria, externalId: '2015' },
    })
  })

  it('login com senha errada ou CPF sem conta dá a mesma resposta', async () => {
    const { service } = setup()
    await service.requestCode({ purpose: 'first_access', cpf: maria })
    await service.setPassword({ cpf: maria, code: '000000', password: 'senha-maria-1' })
    await expect(service.login(maria, 'errada-123')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    })
    await expect(service.login(newCpf, 'errada-123')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    })
  })

  it('não cria conta local se a API falhar no cadastro', async () => {
    const { service, customers } = setup()
    customers.register = async () => {
      throw new Error('API fora do ar')
    }
    await service.requestCode({ purpose: 'signup', cpf: newCpf, email: 'novo@example.com' })
    await expect(
      service.register({
        customer: {
          name: 'Cliente Novo',
          cpf: newCpf,
          phone: '84999998888',
          email: 'novo@example.com',
          address,
        },
        password: 'senha-nova-1',
        code: '000000',
      }),
    ).rejects.toThrow()
    expect(await service.identify(newCpf)).toEqual({ status: 'new' })
  })

  it('código do admin permite primeiro acesso de CPF sem e-mail, exigindo e-mail', async () => {
    const { service, customers } = setup()
    await customers.register({
      name: 'Sem Email',
      cpf: '39053344705',
      phone: '84999990000',
      email: null,
      password: 'x1234567',
    })
    const code = await service.issueAdminCode('39053344705', 'admin-1')
    await expect(
      service.setPassword({ cpf: '39053344705', code, password: 'senha-nova-1' }),
    ).rejects.toMatchObject({ code: 'EMAIL_REQUIRED' })
    const result = await service.setPassword({
      cpf: '39053344705',
      code,
      password: 'senha-nova-1',
      email: 'sememail@example.com',
    })
    expect(result.account.email).toBe('sememail@example.com')
  })

  it('troca de senha encerra as outras sessões', async () => {
    const repository = new AccountRepository(createDatabase(':memory:'))
    let current = new Date('2026-10-16T12:00:00.000Z')
    const now = () => current
    const verification = new VerificationService(
      repository,
      new MockMailGateway(),
      now,
      () => '000000',
    )
    const service = new AccountService(repository, new MockCustomerGateway(), verification, now)

    await service.requestCode({ purpose: 'first_access', cpf: maria })
    const first = await service.setPassword({
      cpf: maria,
      code: '000000',
      password: 'senha-maria-1',
    })
    current = new Date(current.getTime() + 60_000)
    await service.requestCode({ purpose: 'reset', cpf: maria })
    const second = await service.setPassword({
      cpf: maria,
      code: '000000',
      password: 'senha-maria-2',
    })

    expect(service.authenticate(first.token)).toBeNull()
    expect(service.authenticate(second.token)?.account.cpf).toBe(maria)
  })
})
