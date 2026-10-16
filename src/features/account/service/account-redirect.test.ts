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

  it('recusa barra invertida e caracteres de controle, que o navegador trata como outro host', () => {
    expect(safeAccountRedirect('/\\evil.example')).toBe('/')
    expect(safeAccountRedirect('/carrinho\n')).toBe('/')
    expect(safeAccountRedirect('/\tevil.example')).toBe('/')
    // Codificada, a barra invertida é só parte do caminho para o React Router.
    expect(safeAccountRedirect('/%5Cevil.example')).toBe('/%5Cevil.example')
  })
})
