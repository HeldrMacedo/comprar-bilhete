// Só aceita destinos internos do painel, evitando redirecionamento aberto.
export function safeAdminRedirect(next: string | null) {
  if (!next || !/^\/admin(\/|\?|$)/.test(next) || next.startsWith('/admin/login')) return '/admin'
  return next
}
