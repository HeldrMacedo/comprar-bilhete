import { Youtube } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAdminSettings, useSaveSettings } from '../../features/admin/runtime/admin-queries'
import { ErrorState } from '../../shared/ui/ErrorState'
import { Spinner } from '../../shared/ui/Spinner'

export function AdminSettingsPage() {
  const settings = useAdminSettings()
  const save = useSaveSettings()
  const [notice, setNotice] = useState<string | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = new FormData(event.currentTarget).get('youtubeUrl')
    setNotice(null)
    save.mutate(typeof value === 'string' ? value.trim() : '', {
      onSuccess: (result) =>
        setNotice(
          result.youtubeVideoId
            ? 'Vídeo salvo. Ele já aparece na página inicial.'
            : 'Vídeo removido da página inicial.',
        ),
    })
  }

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>Configurações</h1>
          <p>Ajustes exibidos no site público.</p>
        </div>
      </header>
      {settings.isPending ? (
        <div className="admin-center">
          <Spinner label="Carregando configurações" />
        </div>
      ) : settings.isError ? (
        <ErrorState message={settings.error.message} onRetry={() => void settings.refetch()} />
      ) : (
        <section className="admin-panel admin-settings" aria-labelledby="youtube-title">
          <h2 id="youtube-title">
            <Youtube size={20} aria-hidden="true" /> Vídeo do YouTube
          </h2>
          <p className="admin-hint">
            Aparece na página inicial, na seção "Assista ao sorteio". Deixe em branco para esconder
            a seção.
          </p>
          <form key={settings.data.youtubeUrl} className="admin-form" onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="settings-youtube">Link do vídeo</label>
              <input
                id="settings-youtube"
                name="youtubeUrl"
                type="url"
                inputMode="url"
                placeholder="https://www.youtube.com/watch?v=…"
                defaultValue={settings.data.youtubeUrl}
                aria-invalid={save.isError}
              />
            </div>
            {save.isError ? (
              <p className="admin-form-error" role="alert">
                {save.error.message}
              </p>
            ) : null}
            {notice ? (
              <p className="admin-notice" role="status">
                {notice}
              </p>
            ) : null}
            <div className="admin-form__actions">
              <button type="submit" className="button button--primary" disabled={save.isPending}>
                {save.isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
          {settings.data.youtubeVideoId ? (
            <figure className="admin-settings__preview">
              <img
                src={`https://i.ytimg.com/vi/${settings.data.youtubeVideoId}/hqdefault.jpg`}
                alt="Miniatura do vídeo configurado"
                width={480}
                height={360}
              />
              <figcaption className="admin-hint">Vídeo atual</figcaption>
            </figure>
          ) : null}
        </section>
      )}
    </section>
  )
}
