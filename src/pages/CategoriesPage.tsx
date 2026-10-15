import { useState } from 'react'
import { normalizeCategoryName, resolveCategoryIcon, suggestCategoryIcon, type CategoryIcon } from '@/domain/category-icons'
import type { EntryKind } from '@/domain/types'
import * as finance from '@/db/finance-repository'
import { useFinance } from '@/state/FinanceContext'
import { Button } from '@/components/ui/button'
import { Field, SelectInput, TextInput } from '@/components/ui/field'
import { CategoryGlyph, IconPicker } from '@/components/finance/CategoryFields'

export function CategoriesPage() {
  const { snapshot, mutate } = useFinance()
  const [message, setMessage] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryKind, setCategoryKind] = useState<EntryKind>('expense')
  const [categoryIcon, setCategoryIcon] = useState<CategoryIcon>('tag')
  const [iconChosen, setIconChosen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftKind, setDraftKind] = useState<EntryKind>('expense')
  const [draftIcon, setDraftIcon] = useState<CategoryIcon>('tag')
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | EntryKind>('all')
  const [replace, setReplace] = useState<{ id: string; kind: EntryKind } | null>(null)
  const [replacementId, setReplacementId] = useState('')
  const [creating, setCreating] = useState(false)

  function resetCreate() {
    setCreating(false)
    setCategoryName('')
    setCategoryKind('expense')
    setCategoryIcon('tag')
    setIconChosen(false)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  function startEdit(category: { id: string; name: string; kind: EntryKind; icon?: string }) {
    setEditingId(category.id)
    setDraftName(category.name)
    setDraftKind(category.kind)
    setDraftIcon(resolveCategoryIcon(category.icon, category.name))
    setReplace(null)
    setMessage(null)
  }

  if (!snapshot) return <p>Carregando categorias...</p>

  const search = normalizeCategoryName(query)
  const visibleCategories = [...snapshot.categories]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'pt-BR'))
    .filter((category) => {
      if (category.id === editingId) return true
      if (kindFilter !== 'all' && category.kind !== kindFilter) return false
      if (!search) return true
      return normalizeCategoryName(category.name).includes(search)
    })

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Categorias</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Cadastre receitas e despesas com um ícone. O ícone sugerido acompanha o nome até você escolher outro.
        </p>
      </header>
      {message ? <p className="rounded-2xl bg-[#f8e8e8] px-4 py-3 text-sm text-expense">{message}</p> : null}

      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Nova categoria</h2>
          {creating ? null : (
            <Button type="button" size="sm" disabled={editingId !== null} onClick={() => { resetCreate(); setCreating(true); setMessage(null) }}>
              Novo
            </Button>
          )}
        </div>
        {creating ? (
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              void mutate(() => finance.saveCategory({ name: categoryName, kind: categoryKind, icon: categoryIcon }), 'Categoria adicionada.').then(() => {
                resetCreate()
                setMessage(null)
              })
            }}
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <TextInput
                value={categoryName}
                onChange={(event) => {
                  const name = event.target.value
                  setCategoryName(name)
                  if (!iconChosen) setCategoryIcon(suggestCategoryIcon(name))
                }}
                placeholder="Nome"
                aria-label="Nome da categoria"
              />
              <SelectInput value={categoryKind} onChange={(event) => setCategoryKind(event.target.value as EntryKind)} aria-label="Tipo da categoria">
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
              </SelectInput>
            </div>
            <div>
              <p className="mb-2 text-sm text-muted-foreground">O ícone sugerido acompanha o nome. Toque em outro para escolher.</p>
              <IconPicker
                value={categoryIcon}
                onChange={(icon) => {
                  setCategoryIcon(icon)
                  setIconChosen(true)
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Salvar</Button>
              <Button type="button" variant="outline" onClick={resetCreate}>Cancelar</Button>
            </div>
          </form>
        ) : null}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar categoria"
            aria-label="Buscar categoria"
          />
          <SelectInput value={kindFilter} onChange={(event) => setKindFilter(event.target.value as 'all' | EntryKind)} aria-label="Filtrar por tipo">
            <option value="all">Todos</option>
            <option value="income">Receitas</option>
            <option value="expense">Despesas</option>
          </SelectInput>
        </div>
        <ul className="mt-3 divide-y divide-border">
          {visibleCategories.length === 0 ? <li className="py-3 text-sm text-muted-foreground">Nenhuma categoria encontrada.</li> : null}
          {visibleCategories
            .map((category) => {
              const icon = resolveCategoryIcon(category.icon, category.name)
              const editing = editingId === category.id
              const locked = (editingId !== null && !editing) || creating
              if (editing) {
                return (
                  <li key={category.id} className="space-y-3 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <TextInput value={draftName} onChange={(event) => setDraftName(event.target.value)} aria-label="Nome da categoria" />
                      <SelectInput value={draftKind} onChange={(event) => setDraftKind(event.target.value as EntryKind)} aria-label="Tipo da categoria">
                        <option value="expense">Despesa</option>
                        <option value="income">Receita</option>
                      </SelectInput>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            void mutate(
                              () => finance.saveCategory({ id: category.id, name: draftName, kind: draftKind, icon: draftIcon }),
                              'Categoria atualizada.',
                            )
                              .then(() => setEditingId(null))
                              .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'))
                          }
                        >
                          Salvar
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                    <IconPicker value={draftIcon} onChange={setDraftIcon} />
                  </li>
                )
              }
              return (
                <li key={category.id} className={`py-3 ${locked ? 'pointer-events-none opacity-40' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <CategoryGlyph icon={icon} />
                      <span className="truncate">{category.name}</span>
                      <span
                        className={
                          category.kind === 'income'
                            ? 'shrink-0 rounded-full bg-[#e5f4eb] px-2 py-0.5 text-xs font-medium text-income'
                            : 'shrink-0 rounded-full bg-[#f8e8e8] px-2 py-0.5 text-xs font-medium text-expense'
                        }
                      >
                        {category.kind === 'income' ? 'Receita' : 'Despesa'}
                      </span>
                    </span>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="sm" disabled={locked} onClick={() => startEdit(category)}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" disabled={locked} onClick={() => setReplace({ id: category.id, kind: category.kind })}>
                        Excluir
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
        </ul>
      </section>

      {replace ? (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">Excluir categoria</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Se ela estiver em uso, escolha outra do mesmo tipo. Os lançamentos, recorrências e compras passam a usar a substituta.
          </p>
          <Field label="Substituir por">
            <SelectInput value={replacementId} onChange={(event) => setReplacementId(event.target.value)}>
              <option value="">Não substituir, se estiver livre</option>
              {snapshot.categories
                .filter((category) => category.kind === replace.kind && category.id !== replace.id)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </SelectInput>
          </Field>
          <div className="mt-3 flex gap-2">
            <Button
              variant="destructive"
              onClick={() => {
                const current = replace
                setReplace(null)
                void mutate(() => finance.deleteCategory(current.id, replacementId || undefined)).catch((error: unknown) =>
                  setMessage(error instanceof Error ? error.message : 'Não foi possível excluir.'),
                )
              }}
            >
              Excluir categoria
            </Button>
            <Button variant="ghost" onClick={() => setReplace(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
