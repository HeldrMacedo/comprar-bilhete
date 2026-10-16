import { describe, expect, it } from 'vitest'
import { createDatabase } from '../../shared/database.js'
import { AccountRepository } from './account-repository.js'

const account = {
  cpf: '52998224725',
  externalId: '2015',
  name: 'Maria da Silva',
  email: 'maria@example.com',
  phone: '84999855367',
}

function setup() {
  return new AccountRepository(createDatabase(':memory:'))
}

describe('AccountRepository', () => {
  it('grava e lê conta com hash de senha', () => {
    const repository = setup()
    repository.saveAccount(account, 'hash-1', '2026-10-16T12:00:00.000Z')
    expect(repository.findAccount(account.cpf)).toEqual({ ...account, passwordHash: 'hash-1' })
  })

  it('encerra as sessões do CPF exceto a atual', () => {
    const repository = setup()
    repository.saveAccount(account, 'hash-1', '2026-10-16T12:00:00.000Z')
    repository.insertSession(
      'a',
      account.cpf,
      '2026-10-16T12:00:00.000Z',
      '2026-11-15T12:00:00.000Z',
    )
    repository.insertSession(
      'b',
      account.cpf,
      '2026-10-16T12:00:00.000Z',
      '2026-11-15T12:00:00.000Z',
    )
    repository.deleteCpfSessions(account.cpf, 'b')
    expect(repository.findSession('a')).toBeNull()
    expect(repository.findSession('b')).toMatchObject({ cpf: account.cpf })
  })

  it('código novo invalida o anterior da mesma finalidade', () => {
    const repository = setup()
    const base = {
      cpf: account.cpf,
      purpose: 'reset' as const,
      email: account.email,
      createdAt: '2026-10-16T12:00:00.000Z',
      expiresAt: '2026-10-16T12:15:00.000Z',
      createdByAdminId: null,
    }
    repository.insertCode({ ...base, codeHash: 'h1' })
    repository.insertCode({ ...base, codeHash: 'h2' })
    const active = repository.findActiveCode(account.cpf, ['reset'], '2026-10-16T12:01:00.000Z')
    expect(active?.codeHash).toBe('h2')
  })

  it('não devolve código expirado ou usado', () => {
    const repository = setup()
    const id = repository.insertCode({
      cpf: account.cpf,
      purpose: 'signup',
      codeHash: 'h1',
      email: account.email,
      createdAt: '2026-10-16T12:00:00.000Z',
      expiresAt: '2026-10-16T12:15:00.000Z',
      createdByAdminId: null,
    })
    expect(
      repository.findActiveCode(account.cpf, ['signup'], '2026-10-16T12:16:00.000Z'),
    ).toBeNull()
    repository.markCodeUsed(id, '2026-10-16T12:02:00.000Z')
    expect(
      repository.findActiveCode(account.cpf, ['signup'], '2026-10-16T12:03:00.000Z'),
    ).toBeNull()
  })
})
