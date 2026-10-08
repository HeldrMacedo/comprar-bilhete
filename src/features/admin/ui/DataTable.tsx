import type { ReactNode } from 'react'
import { ErrorState } from '../../../shared/ui/ErrorState'
import { Spinner } from '../../../shared/ui/Spinner'

export type Column<Row> = {
  key: string
  header: string
  render: (row: Row) => ReactNode
  align?: 'start' | 'end'
}

type DataTableProps<Row> = {
  caption: string
  columns: Column<Row>[]
  rows: Row[] | undefined
  rowKey: (row: Row) => string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  emptyMessage: string
}

// Em telas estreitas cada linha vira um cartão; data-label alimenta o rótulo via CSS.
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  onRetry,
  emptyMessage,
}: DataTableProps<Row>) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (loading || !rows) {
    return (
      <div className="admin-table__state">
        <Spinner label="Carregando dados" />
      </div>
    )
  }
  if (rows.length === 0) {
    return <p className="admin-table__state">{emptyMessage}</p>
  }

  return (
    <div className="admin-table">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" data-align={column.align ?? 'start'}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={column.header}
                  data-align={column.align ?? 'start'}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
