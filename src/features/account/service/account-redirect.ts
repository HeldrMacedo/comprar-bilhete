// Só destinos internos do site público, evitando redirecionamento aberto.
// Barra invertida e caracteres de controle ficam de fora: o navegador lê `/\host` como `//host`.
export function safeAccountRedirect(next: string | null) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return '/'
  if (/^\/(admin|entrar)(\/|\?|$)/.test(next)) return '/'
  return next
}
