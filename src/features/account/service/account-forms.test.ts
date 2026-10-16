import { describe, expect, it } from 'vitest'
import { newPasswordFormSchema, noEmailFormSchema, signupFormSchema } from './account-forms'

const signup = {
  name: 'Cliente Novo',
  cpf: '111.444.777-35',
  phone: '(84) 99999-8888',
  email: 'Novo@Example.com',
  address: {
    zipCode: '59062-300',
    street: 'av lima',
    number: '1',
    complement: '',
    neighborhood: 'nazare',
    city: 'natal',
    state: 'rn',
  },
  password: 'senha-nova-1',
  confirmPassword: 'senha-nova-1',
}

describe('formulários de conta', () => {
  it('normaliza cadastro', () => {
    const parsed = signupFormSchema.parse(signup)
    expect(parsed.email).toBe('novo@example.com')
    expect(parsed.address.state).toBe('RN')
  })

  it('exige confirmação igual e senha com 8 caracteres', () => {
    expect(signupFormSchema.safeParse({ ...signup, confirmPassword: 'outra-123' }).success).toBe(
      false,
    )
    expect(
      newPasswordFormSchema.safeParse({
        code: '000000',
        password: '1234567',
        confirmPassword: '1234567',
      }).success,
    ).toBe(false)
  })

  it('cadastro sem e-mail exige código, e-mail válido e senhas iguais', () => {
    const noEmail = {
      code: '482913',
      email: ' Cliente@Example.com ',
      password: 'senha-cliente-1',
      confirmPassword: 'senha-cliente-1',
    }
    expect(noEmailFormSchema.parse(noEmail).email).toBe('cliente@example.com')
    expect(noEmailFormSchema.safeParse({ ...noEmail, code: '12345' }).success).toBe(false)
    expect(noEmailFormSchema.safeParse({ ...noEmail, email: 'cliente' }).success).toBe(false)
    expect(noEmailFormSchema.safeParse({ ...noEmail, confirmPassword: 'outra-123' }).success).toBe(
      false,
    )
  })
})
