import { useState } from 'react'
import { useAdminRaffles, useSaveRaffle } from '../../features/admin/runtime/admin-queries'
import { ContestEditor } from '../../features/admin/ui/ContestEditor'
import { ErrorState } from '../../shared/ui/ErrorState'
import { Spinner } from '../../shared/ui/Spinner'

export function AdminRafflesPage() {
  const raffles = useAdminRaffles()
  const save = useSaveRaffle()
  const [saved, setSaved] = useState<string | null>(null)

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>Sorteios</h1>
          <p>
            Sorteios cadastrados na API de bilhetes. As alterações são gravadas diretamente na API.
          </p>
        </div>
      </header>
      {saved ? (
        <p className="admin-notice" role="status">
          {saved}
        </p>
      ) : null}
      {raffles.isPending ? (
        <div className="admin-center">
          <Spinner label="Carregando sorteios" />
        </div>
      ) : raffles.isError ? (
        <ErrorState message={raffles.error.message} onRetry={() => void raffles.refetch()} />
      ) : raffles.data.length === 0 ? (
        <p className="admin-table__state">Nenhum sorteio cadastrado na API de bilhetes.</p>
      ) : (
        raffles.data.map((contest) => (
          <ContestEditor
            key={`${contest.source}-${contest.contestId}`}
            contest={contest}
            pending={save.isPending && save.variables?.source === contest.source}
            error={
              save.isError && save.variables?.source === contest.source ? save.error.message : null
            }
            onSave={(values, done) => {
              setSaved(null)
              save.mutate(
                { source: contest.source, values },
                {
                  onSuccess: () => {
                    done()
                    setSaved(`Sorteio #${contest.contestId} atualizado.`)
                  },
                },
              )
            }}
          />
        ))
      )}
    </section>
  )
}
