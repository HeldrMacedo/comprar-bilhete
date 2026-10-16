import { describe, expect, it } from 'vitest'
import { safeAccountRedirect } from './account-redirect'

describe('safeAccountRedirect', () => {
  it('aceita só caminhos internos fora do admin e do login', () => {
    expect(safeAccountRedirect('/carrinho')).toBe('/carrinho')
    expect(safeAccountRedirect('/minhas-compras')).toBe('/minhas-compras')
    expect(safeAccountRedirect('https://malicioso.example')).toBe('/')
    expect(safeAccountRedirect('//malicioso.example')).toBe('/')
    expect(safeAccountRedirect('/admin')).toBe('/')
    expect(safeAccountRedirect('/entrar')).toBe('/')
    expect(safeAccountRedirect(null)).toBe('/')
  })
})
