import { describe, expect, it } from 'vitest'
import { createDatabase } from '../../shared/database.js'
import { AccountRepository } from './account-repository.js'
import { MockMailGateway } from './mock-mail-gateway.js'
import { VerificationService } from './verification-service.js'

const cpf = '52998224725'

function setup(start = '2026-10-16T12:00:00.000Z') {
  let current = new Date(start)
  const mail = new MockMailGateway()
  const service = new VerificationService(
    new AccountRepository(createDatabase(':memory:')),
    mail,
    () => current,
    () => '123456',
  )
  return {
    service,
    mail,
    advance(ms: number) {
      current = new Date(current.getTime() + ms)
    },
  }
}

describe('VerificationService', () => {
  it('envia o código ao e-mail e o aceita uma vez', async () => {
    const { service, mail } = setup()
    await service.send(cpf, 'reset', 'maria@example.com')
    expect(mail.sent).toEqual([{ to: 'maria@example.com', code: '123456' }])

    const code = service.verify(cpf, ['reset'], '123456')
    expect(code.email).toBe('maria@example.com')
    service.markUsed(code.id)
    expect(() => service.verify(cpf, ['reset'], '123456')).toThrow(/código/i)
  })

  it('recusa código expirado', async () => {
    const { service, advance } = setup()
    await service.send(cpf, 'signup', 'novo@example.com')
    advance(15 * 60_000 + 1)
    expect(() => service.verify(cpf, ['signup'], '123456')).toThrow(/código/i)
  })

  it('bloqueia após 5 tentativas erradas, mesmo com o código certo', async () => {
    const { service } = setup()
    await service.send(cpf, 'reset', 'maria@example.com')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(() => service.verify(cpf, ['reset'], '000000')).toThrow()
    }
    expect(() => service.verify(cpf, ['reset'], '123456')).toThrow(/código/i)
  })

  it('exige 60 s entre envios', async () => {
    const { service, advance } = setup()
    await service.send(cpf, 'reset', 'maria@example.com')
    await expect(service.send(cpf, 'reset', 'maria@example.com')).rejects.toMatchObject({
      code: 'CODE_RESEND_TOO_SOON',
    })
    advance(60_000)
    await expect(service.send(cpf, 'reset', 'maria@example.com')).resolves.toBeUndefined()
  })

  it('código do admin vale 24 h e não envia e-mail', () => {
    const { service, mail, advance } = setup()
    expect(service.issueForAdmin(cpf, 'admin-1')).toBe('123456')
    expect(mail.sent).toEqual([])
    advance(23 * 60 * 60_000)
    expect(service.verify(cpf, ['admin'], '123456').purpose).toBe('admin')
  })
})
