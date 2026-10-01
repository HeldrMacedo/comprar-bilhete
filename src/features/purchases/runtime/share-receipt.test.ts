import { afterEach, describe, expect, it, vi } from 'vitest'
import { shareReceipts } from './share-receipt'

const file = new File(['png'], 'bilhete-80001.png', { type: 'image/png' })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('shareReceipts', () => {
  it('abre o menu de compartilhar do aparelho com as imagens', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { canShare: () => true, share })

    await expect(shareReceipts([file])).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'Comprovante Sol da Sorte' })
  })

  it('trata o cancelamento do menu como desistência, sem erro', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelado', 'AbortError'))
    vi.stubGlobal('navigator', { canShare: () => true, share })

    await expect(shareReceipts([file])).resolves.toBe('cancelled')
  })

  it('baixa as imagens quando o navegador não compartilha arquivos', async () => {
    vi.stubGlobal('navigator', {})
    const createObjectURL = vi.fn().mockReturnValue('blob:comprovante')
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await expect(shareReceipts([file, file])).resolves.toBe('downloaded')
    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(click).toHaveBeenCalledTimes(2)
  })
})
