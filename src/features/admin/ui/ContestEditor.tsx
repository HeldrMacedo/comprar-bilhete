import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, type FieldError } from 'react-hook-form'
import { formatCurrency } from '../../../shared/lib/currency'
import type { ContestSlot, ContestValues } from '../domain/types'
import {
  contestFormSchema,
  fromContestForm,
  sensitiveChanges,
  toContestForm,
  type ContestForm,
  type SensitiveChange,
} from '../service/contest-form'
import { ConfirmDialog } from './ConfirmDialog'

const CONTEST_NAMES = { cap: 'Sorteio de quarta', esp: 'Sorteio de domingo' } as const

type ContestEditorProps = {
  contest: ContestSlot
  pending: boolean
  error: string | null
  onSave: (values: ContestValues, done: () => void) => void
}

function FieldMessage({ error }: { error?: FieldError }) {
  return error?.message ? <small role="alert">{error.message}</small> : null
}

export function ContestEditor({ contest, pending, error, onSave }: ContestEditorProps) {
  const id = `contest-${contest.source}`
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<ContestForm>({
    resolver: zodResolver(contestFormSchema),
    defaultValues: toContestForm(contest),
  })
  const [pendingValues, setPendingValues] = useState<{
    values: ContestValues
    changes: SensitiveChange[]
  } | null>(null)
  const spins = watch('luckySpinsCount')

  function save(values: ContestValues) {
    onSave(values, () => {
      setPendingValues(null)
      reset(toContestForm(values))
    })
  }

  const submit = handleSubmit((form) => {
    const values = fromContestForm(form)
    const changes = sensitiveChanges(contest, values, formatCurrency)
    if (changes.length > 0) setPendingValues({ values, changes })
    else save(values)
  })

  return (
    <article className="admin-panel admin-contest" aria-labelledby={`${id}-title`}>
      <header className="admin-contest__header">
        <h2 id={`${id}-title`}>
          {CONTEST_NAMES[contest.source]} <span className="admin-hint">#{contest.contestId}</span>
        </h2>
      </header>
      <form className="admin-form" onSubmit={submit} noValidate>
        <fieldset className="admin-fieldset">
          <legend>Datas (horário de Fortaleza)</legend>
          <div className="admin-form__grid">
            <div className="field">
              <label htmlFor={`${id}-start`}>Início das vendas</label>
              <input
                id={`${id}-start`}
                type="datetime-local"
                {...register('salesStartAt')}
                aria-invalid={!!errors.salesStartAt}
              />
              <FieldMessage error={errors.salesStartAt} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-end`}>Fim das vendas</label>
              <input
                id={`${id}-end`}
                type="datetime-local"
                {...register('salesEndAt')}
                aria-invalid={!!errors.salesEndAt}
              />
              <FieldMessage error={errors.salesEndAt} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-draw-date`}>Data do sorteio</label>
              <input
                id={`${id}-draw-date`}
                type="date"
                {...register('drawDate')}
                aria-invalid={!!errors.drawDate}
              />
              <FieldMessage error={errors.drawDate} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-draw-time`}>Hora do sorteio</label>
              <input
                id={`${id}-draw-time`}
                type="time"
                {...register('drawTime')}
                aria-invalid={!!errors.drawTime}
              />
              <FieldMessage error={errors.drawTime} />
            </div>
          </div>
        </fieldset>

        <fieldset className="admin-fieldset">
          <legend>Bilhete</legend>
          <div className="admin-form__grid">
            <div className="field">
              <label htmlFor={`${id}-price`}>Valor do bilhete (R$)</label>
              <input
                id={`${id}-price`}
                inputMode="decimal"
                {...register('price')}
                aria-invalid={!!errors.price}
              />
              <FieldMessage error={errors.price} />
            </div>
            <label className="checkbox-field admin-contest__check" htmlFor={`${id}-double`}>
              <input id={`${id}-double`} type="checkbox" {...register('doubleChance')} />
              Dupla chance
            </label>
            <div className="field">
              <label htmlFor={`${id}-spins`}>Giros da sorte</label>
              <input
                id={`${id}-spins`}
                inputMode="numeric"
                {...register('luckySpinsCount')}
                aria-invalid={!!errors.luckySpinsCount}
              />
              <FieldMessage error={errors.luckySpinsCount} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-spins-label`}>Valor dos giros</label>
              <input
                id={`${id}-spins-label`}
                placeholder="R$ 500,00"
                disabled={Number(spins) === 0}
                {...register('luckySpinsLabel')}
                aria-invalid={!!errors.luckySpinsLabel}
              />
              <FieldMessage error={errors.luckySpinsLabel} />
            </div>
          </div>
        </fieldset>

        <fieldset className="admin-fieldset">
          <legend>Prêmios (até 5, na ordem do sorteio)</legend>
          <div className="admin-contest__prizes">
            {Array.from({ length: 5 }, (_, index) => (
              <div className="field" key={index}>
                <label htmlFor={`${id}-prize-${index}`}>{index + 1}º prêmio</label>
                <input
                  id={`${id}-prize-${index}`}
                  {...register(`prizes.${index}.value`)}
                  aria-invalid={!!errors.prizes?.[index]?.value}
                />
                <FieldMessage error={errors.prizes?.[index]?.value} />
              </div>
            ))}
          </div>
          {errors.prizes?.root?.message ? (
            <small className="admin-form-error" role="alert">
              {errors.prizes.root.message}
            </small>
          ) : null}
        </fieldset>

        {error ? (
          <p className="admin-form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="admin-form__actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={!isDirty || pending}
            onClick={() => reset(toContestForm(contest))}
          >
            Desfazer
          </button>
          <button type="submit" className="button button--primary" disabled={!isDirty || pending}>
            {pending ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>

      <ConfirmDialog
        title="Confirmar alteração de valor ou datas"
        open={pendingValues !== null}
        confirmLabel="Salvar"
        pending={pending}
        error={error}
        onClose={() => setPendingValues(null)}
        onConfirm={() => {
          if (pendingValues) save(pendingValues.values)
        }}
      >
        <p>Estas mudanças valem imediatamente para o site e para a API de bilhetes:</p>
        <ul className="admin-changes">
          {pendingValues?.changes.map((change) => (
            <li key={change.label}>
              <strong>{change.label}:</strong> {change.before} → {change.after}
            </li>
          ))}
        </ul>
        <p className="admin-hint">
          Quem está com o carrinho aberto precisará refazer a compra se o valor mudar.
        </p>
      </ConfirmDialog>
    </article>
  )
}
