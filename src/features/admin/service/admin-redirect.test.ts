import { expect, it } from 'vitest'
import { safeAdminRedirect } from './admin-redirect'

it('keeps internal admin destinations and rejects everything else', () => {
  expect(safeAdminRedirect('/admin/usuarios?pagina=2')).toBe('/admin/usuarios?pagina=2')
  expect(safeAdminRedirect('/admin')).toBe('/admin')
  expect(safeAdminRedirect(null)).toBe('/admin')
  expect(safeAdminRedirect('https://evil.example/admin')).toBe('/admin')
  expect(safeAdminRedirect('//evil.example')).toBe('/admin')
  expect(safeAdminRedirect('/administrador')).toBe('/admin')
  expect(safeAdminRedirect('/admin/login?next=/admin')).toBe('/admin')
})
