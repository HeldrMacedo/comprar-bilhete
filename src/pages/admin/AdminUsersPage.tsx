import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { AdminUser, UpdateAdminUserInput } from '../../features/admin/domain/types'
import {
  useAdminSession,
  useAdminUsers,
  useDeleteAdminUser,
  useSaveAdminUser,
} from '../../features/admin/runtime/admin-queries'
import { AdminUserForm } from '../../features/admin/ui/AdminUserForm'
import { ConfirmDialog } from '../../features/admin/ui/ConfirmDialog'
import { DataTable, type Column } from '../../features/admin/ui/DataTable'
import { Dialog } from '../../features/admin/ui/Dialog'
import { StatusBadge } from '../../features/admin/ui/StatusBadge'
import { formatDateTime } from '../../shared/lib/date'

type Editing = { mode: 'create' } | { mode: 'edit'; user: AdminUser } | null

export function AdminUsersPage() {
  const session = useAdminSession()
  const users = useAdminUsers()
  const save = useSaveAdminUser()
  const remove = useDeleteAdminUser()
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<AdminUser | null>(null)
  const currentUserId = session.data?.id

  function openEditor(next: Editing) {
    save.reset()
    setEditing(next)
  }

  function submit(values: UpdateAdminUserInput) {
    if (!editing) return
    const input =
      editing.mode === 'create'
        ? {
            kind: 'create' as const,
            data: {
              login: values.login ?? '',
              name: values.name ?? '',
              password: values.password ?? '',
            },
          }
        : { kind: 'update' as const, userId: editing.user.id, data: values }
    save.mutate(input, { onSuccess: () => setEditing(null) })
  }

  const columns: Column<AdminUser>[] = [
    {
      key: 'name',
      header: 'Nome',
      render: (user) => (
        <>
          {user.name}
          {user.id === currentUserId ? <span className="admin-hint"> (você)</span> : null}
        </>
      ),
    },
    { key: 'login', header: 'Login', render: (user) => user.login },
    {
      key: 'status',
      header: 'Status',
      render: (user) =>
        user.active ? (
          <StatusBadge tone="success">Ativo</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Inativo</StatusBadge>
        ),
    },
    { key: 'createdAt', header: 'Criado em', render: (user) => formatDateTime(user.createdAt) },
    {
      key: 'actions',
      header: 'Ações',
      align: 'end',
      render: (user) => (
        <div className="admin-row-actions">
          <button
            type="button"
            className="admin-icon-button"
            aria-label={`Editar ${user.name}`}
            onClick={() => openEditor({ mode: 'edit', user })}
          >
            <Pencil size={16} aria-hidden="true" />
          </button>
          {user.id === currentUserId ? null : (
            <button
              type="button"
              className="admin-icon-button admin-icon-button--danger"
              aria-label={`Excluir ${user.name}`}
              onClick={() => {
                remove.reset()
                setDeleting(user)
              }}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>Usuários do sistema</h1>
          <p>Quem pode acessar o painel. Todos têm acesso total.</p>
        </div>
        <button
          type="button"
          className="button button--primary"
          onClick={() => openEditor({ mode: 'create' })}
        >
          <Plus size={18} aria-hidden="true" />
          Novo usuário
        </button>
      </header>

      <DataTable
        caption="Usuários do painel"
        columns={columns}
        rows={users.data}
        rowKey={(user) => user.id}
        loading={users.isPending}
        error={users.isError ? users.error.message : null}
        onRetry={() => void users.refetch()}
        emptyMessage="Nenhum usuário cadastrado."
      />

      <Dialog
        title={editing?.mode === 'edit' ? 'Editar usuário' : 'Novo usuário'}
        open={editing !== null}
        onClose={() => setEditing(null)}
      >
        {editing ? (
          <AdminUserForm
            key={editing.mode === 'edit' ? editing.user.id : 'new'}
            user={editing.mode === 'edit' ? editing.user : null}
            isSelf={editing.mode === 'edit' && editing.user.id === currentUserId}
            pending={save.isPending}
            error={save.isError ? save.error.message : null}
            onSubmit={submit}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        title="Excluir usuário"
        open={deleting !== null}
        tone="danger"
        confirmLabel="Excluir"
        pending={remove.isPending}
        error={remove.isError ? remove.error.message : null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }}
      >
        <p>
          {deleting?.name} ({deleting?.login}) perde o acesso ao painel imediatamente. Esta ação não
          pode ser desfeita.
        </p>
      </ConfirmDialog>
    </section>
  )
}
