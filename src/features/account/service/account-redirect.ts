// Só destinos internos do site público, evitando redirecionamento aberto.
export function safeAccountRedirect(next: string | null) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  if (/^\/(admin|entrar)(\/|\?|$)/.test(next)) return '/'
  return next
}
