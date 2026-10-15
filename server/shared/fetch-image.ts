import { DomainError } from './errors.js'

const maxImageBytes = 10 * 1024 * 1024

export type FetchedImage = { contentType: string; body: Buffer }

export async function fetchImage(url: string): Promise<FetchedImage> {
  const response = await fetch(url, {
    headers: { Accept: 'image/*' },
    signal: AbortSignal.timeout(10_000),
  })
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
  if (!response.ok || !contentType.startsWith('image/')) {
    throw new DomainError('Imagem indisponível.', 502, 'UPSTREAM_ERROR')
  }

  const body = Buffer.from(await response.arrayBuffer())
  if (body.byteLength > maxImageBytes) {
    throw new DomainError('Imagem indisponível.', 502, 'UPSTREAM_ERROR')
  }
  return { contentType, body }
}
