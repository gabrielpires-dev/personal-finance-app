import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Plus } from 'lucide-react'
import { categoryIconChoices, categoryIcons, suggestCategoryIcon, type CategoryIcon } from '@/domain/category-icons'
import type { EntryKind } from '@/domain/types'
import { cn } from '@/lib/cn'

export function CategoryGlyph({ icon, className }: { icon: CategoryIcon; className?: string }) {
  const Icon = categoryIcons[icon]
  return <Icon className={cn('h-5 w-5', className)} aria-hidden />
}

export function IconPicker({
  value,
  onChange,
}: {
  value: CategoryIcon
  onChange: (icon: CategoryIcon) => void
}) {
  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-8" role="listbox" aria-label="Ícone da categoria">
      {categoryIconChoices.map((choice) => {
        const selected = choice.id === value
        return (
          <button
            key={choice.id}
            type="button"
            role="option"
            aria-selected={selected}
            aria-label={choice.label}
            title={choice.label}
            className={cn(
              'grid h-11 place-items-center rounded-xl border',
              selected ? 'border-primary bg-secondary text-income' : 'border-border bg-card text-foreground',
            )}
            onClick={() => onChange(choice.id)}
          >
            <CategoryGlyph icon={choice.id} />
          </button>
        )
      })}
    </div>
  )
}

export function CategorySelect({
  categories,
  value,
  onChange,
  name,
  kind,
  onCreate,
  emptyLabel,
  disabled,
}: {
  categories: Array<{ id: string; name: string; icon: CategoryIcon }>
  value: string
  onChange: (id: string) => void
  name?: string
  kind?: EntryKind
  onCreate?: (input: { name: string; icon: CategoryIcon; kind: EntryKind }) => Promise<void>
  emptyLabel?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const matched = categories.find((category) => category.id === value)
  const selected = emptyLabel ? matched : matched ?? categories[0]

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={rootRef}>
      {name ? <input type="hidden" name={name} value={selected?.id ?? ''} /> : null}
      <button
        type="button"
        className="flex h-12 w-full items-center gap-2 rounded-xl border border-border bg-white px-3 text-left text-base disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {selected ? <CategoryGlyph icon={selected.icon} /> : null}
        <span className="min-w-0 flex-1 truncate">{selected?.name ?? emptyLabel ?? 'Escolha uma categoria'}</span>
      </button>
      {open ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-md">
          <ul className="max-h-44 overflow-auto py-1" role="listbox">
            {emptyLabel ? (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={!selected}
                  className={cn('flex h-11 w-full items-center px-3 text-left', !selected ? 'bg-secondary text-income' : 'hover:bg-secondary')}
                  onClick={() => {
                    onChange('')
                    setOpen(false)
                  }}
                >
                  {emptyLabel}
                </button>
              </li>
            ) : null}
            {categories.map((category) => (
              <li key={category.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={category.id === selected?.id}
                  className={cn(
                    'flex h-11 w-full items-center gap-2 px-3 text-left',
                    category.id === selected?.id ? 'bg-secondary text-income' : 'hover:bg-secondary',
                  )}
                  onClick={() => {
                    onChange(category.id)
                    setOpen(false)
                  }}
                >
                  <CategoryGlyph icon={category.icon} />
                  <span>{category.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {onCreate && kind ? (
            <button
              type="button"
              className="flex h-11 w-full items-center gap-2 border-t border-border px-3 text-left font-semibold text-income hover:bg-secondary"
              onClick={() => {
                setOpen(false)
                setCreating(true)
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Cadastrar categoria
            </button>
          ) : null}
        </div>
      ) : null}
      {onCreate && kind ? (
        <QuickCategoryDialog
          open={creating}
          kind={kind}
          onOpenChange={setCreating}
          onCreate={async (input) => {
            await onCreate(input)
            setCreating(false)
          }}
        />
      ) : null}
    </div>
  )
}

function QuickCategoryDialog({
  open,
  kind,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  kind: EntryKind
  onOpenChange: (open: boolean) => void
  onCreate: (input: { name: string; icon: CategoryIcon; kind: EntryKind }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<CategoryIcon>('tag')
  const [iconChosen, setIconChosen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setName('')
    setIcon('tag')
    setIconChosen(false)
    setError(null)
    setSaving(false)
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#14211b]/40" />
        <Dialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto flex max-h-[90dvh] w-full max-w-md -translate-y-1/2 flex-col overflow-hidden rounded-3xl bg-card shadow-xl">
          <div className="border-b border-border px-5 py-4">
            <Dialog.Title className="text-lg font-semibold">Nova categoria</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              {`Ela entra como ${kind === 'income' ? 'receita' : 'despesa'}.`}
            </Dialog.Description>
          </div>
          <form
            className="space-y-4 overflow-y-auto px-5 py-4"
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              const trimmed = name.trim()
              if (trimmed.length < 2) {
                setError('Informe um nome com pelo menos 2 caracteres.')
                return
              }
              setSaving(true)
              setError(null)
              void onCreate({ name: trimmed, icon, kind })
                .catch((caught: unknown) => {
                  setSaving(false)
                  setError(caught instanceof Error ? caught.message : 'Não foi possível cadastrar.')
                })
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Nome</span>
              <input
                value={name}
                autoFocus
                className="h-12 w-full rounded-xl border border-border bg-white px-3 text-base outline-none focus:border-primary"
                placeholder={kind === 'income' ? 'Freelance' : 'Farmácia'}
                onChange={(event) => {
                  const next = event.target.value
                  setName(next)
                  if (!iconChosen) setIcon(suggestCategoryIcon(next))
                }}
              />
            </label>
            <div>
              <p className="mb-2 text-sm font-semibold">Ícone</p>
              <IconPicker
                value={icon}
                onChange={(next) => {
                  setIcon(next)
                  setIconChosen(true)
                }}
              />
            </div>
            {error ? <p className="text-sm text-expense" role="alert">{error}</p> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Dialog.Close type="button" className="h-11 rounded-xl border border-border px-4 font-semibold">
                Cancelar
              </Dialog.Close>
              <button type="submit" className="h-11 rounded-xl bg-primary px-4 font-semibold text-white disabled:opacity-50" disabled={saving}>
                {saving ? 'Salvando...' : 'Cadastrar'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
