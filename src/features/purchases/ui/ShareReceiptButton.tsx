import { Share2 } from 'lucide-react'
import { useState } from 'react'
import type { Purchase, PurchaseItem } from '../domain/types'
import { createReceiptFiles, shareReceipts } from '../runtime/share-receipt'

type Feedback = { tone: 'status' | 'alert'; text: string } | null

export function ShareReceiptButton({
  purchase,
  items,
  label,
  ariaLabel,
  compact = false,
}: {
  purchase: Purchase
  items: PurchaseItem[]
  label: string
  ariaLabel?: string
  compact?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  // Alguns navegadores só abrem o menu de compartilhar dentro do toque; se a geração da imagem
  // demorar, as imagens ficam prontas e o próximo toque compartilha direto.
  const [readyFiles, setReadyFiles] = useState<File[] | null>(null)

  async function onShare() {
    setBusy(true)
    setFeedback(null)
    let files = readyFiles
    try {
      files ??= await createReceiptFiles(purchase, items)
      const outcome = await shareReceipts(files)
      setReadyFiles(null)
      if (outcome === 'downloaded') {
        setFeedback({ tone: 'status', text: 'Comprovantes salvos. Anexe no WhatsApp.' })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError' && !readyFiles) {
        setReadyFiles(files)
        setFeedback({
          tone: 'status',
          text: 'Comprovante pronto. Toque de novo para compartilhar.',
        })
      } else {
        setReadyFiles(null)
        setFeedback({
          tone: 'alert',
          text: 'Não foi possível gerar o comprovante. Tente novamente.',
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`share-receipt ${compact ? 'share-receipt--compact' : ''}`}>
      <button
        className={`button ${compact ? 'button--secondary' : 'button--whatsapp'}`}
        type="button"
        onClick={() => void onShare()}
        disabled={busy}
        aria-label={ariaLabel}
      >
        <Share2 size={17} aria-hidden="true" /> {busy ? 'Gerando...' : label}
      </button>
      {feedback ? (
        <small role={feedback.tone} className={`share-receipt__${feedback.tone}`}>
          {feedback.text}
        </small>
      ) : null}
    </div>
  )
}
