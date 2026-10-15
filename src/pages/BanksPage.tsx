import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { institutionById } from '@/domain/institutions'
import type { BankAccount, CreditCard } from '@/domain/types'
import * as finance from '@/db/finance-repository'
import { useFinance } from '@/state/FinanceContext'
import { BankMark, InstitutionSelect, bankAccountLabel } from '@/components/finance/BankSelect'
import { CardMark } from '@/components/finance/CardSelect'
import { Button } from '@/components/ui/button'
import { Field, TextInput } from '@/components/ui/field'
import { cn } from '@/lib/cn'

interface BankDraft {
  institutionId: string
  agency: string
  account: string
  cardIds: string[]
  active: boolean
}

const emptyDraft: BankDraft = { institutionId: '', agency: '', account: '', cardIds: [], active: true }

export function BanksPage() {
  const { snapshot, mutate } = useFinance()
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<BankDraft>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (!snapshot) return <p>Carregando bancos...</p>

  const data = snapshot
  const cards = [...data.creditCards].filter((card) => card.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const banks = [...(data.banks ?? [])].sort((a, b) => bankAccountLabel(a).localeCompare(bankAccountLabel(b), 'pt-BR'))

  function ownerOf(cardId: string, exceptBankId: string | null) {
    return (data.banks ?? []).find((bank) => bank.id !== exceptBankId && bank.cardIds.includes(cardId)) ?? null
  }

  async function save(id?: string) {
    await mutate(
      () =>
        finance.saveBank({
          id,
          institutionId: draft.institutionId,
          agency: draft.agency,
          account: draft.account,
          cardIds: draft.cardIds,
          active: draft.active,
        }),
      id ? 'Banco atualizado.' : 'Banco adicionado.',
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Bancos</h1>
        {creating || editingId ? null : (
          <Button
            size="sm"
            onClick={() => {
              setDraft(emptyDraft)
              setCreating(true)
              setMessage(null)
            }}
          >
            Novo
          </Button>
        )}
      </header>
      {message ? <p className="rounded-2xl bg-[#f8e8e8] px-4 py-3 text-sm text-expense">{message}</p> : null}
      {creating ? (
        <BankForm
          title="Novo banco"
          draft={draft}
          cards={cards}
          ownerOf={(cardId) => ownerOf(cardId, null)}
          onChange={setDraft}
          onCancel={() => setCreating(false)}
          onSubmit={() =>
            save()
              .then(() => {
                setCreating(false)
                setDraft(emptyDraft)
                setMessage(null)
              })
              .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'))
          }
        />
      ) : null}
      <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card">
        {banks.length === 0 ? <li className="p-4 text-sm text-muted-foreground">Nenhum banco cadastrado.</li> : null}
        {banks.map((bank) => {
          const institution = institutionById(bank.institutionId)
          const editing = editingId === bank.id
          if (editing) {
            return (
              <li key={bank.id} className="p-4">
                <BankForm
                  title="Editar banco"
                  draft={draft}
                  cards={cards}
                  ownerOf={(cardId) => ownerOf(cardId, bank.id)}
                  onChange={setDraft}
                  onCancel={() => setEditingId(null)}
                  onSubmit={() =>
                    save(bank.id)
                      .then(() => {
                        setEditingId(null)
                        setMessage(null)
                      })
                      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'))
                  }
                />
              </li>
            )
          }
          const linked = cards.filter((card) => bank.cardIds.includes(card.id))
          return (
            <li key={bank.id} className={cn('flex items-center justify-between gap-3 p-4', (creating || editingId) && 'pointer-events-none opacity-40')}>
              <span className="flex min-w-0 items-center gap-3">
                {institution ? <BankMark institution={institution} className="h-10 w-10 text-[11px]" /> : null}
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold">{institution?.name ?? 'Banco'}</span>
                    {bank.active === false ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Inativo</span> : null}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    Ag {bank.agency} · Cc {bank.account}
                    {linked.length ? ` · ${linked.map((card) => card.name).join(', ')}` : ''}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingId(bank.id)
                    setCreating(false)
                    setDraft({
                      institutionId: bank.institutionId,
                      agency: bank.agency,
                      account: bank.account,
                      cardIds: [...bank.cardIds],
                      active: bank.active !== false,
                    })
                    setMessage(null)
                  }}
                >
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void mutate(() => finance.deleteBank(bank.id), 'Banco excluído.').catch((error: unknown) =>
                      setMessage(error instanceof Error ? error.message : 'Não foi possível excluir.'),
                    )
                  }
                >
                  Excluir
                </Button>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function BankForm({
  title,
  draft,
  cards,
  ownerOf,
  onChange,
  onCancel,
  onSubmit,
}: {
  title: string
  draft: BankDraft
  cards: CreditCard[]
  ownerOf: (cardId: string) => BankAccount | null
  onChange: (draft: BankDraft) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <form
      className="space-y-3 rounded-3xl border border-border bg-card p-4 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <Field label="Instituição">
        <InstitutionSelect value={draft.institutionId} onChange={(institutionId) => onChange({ ...draft, institutionId })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Agência">
          <TextInput value={draft.agency} onChange={(event) => onChange({ ...draft, agency: event.target.value })} aria-label="Agência" />
        </Field>
        <Field label="Conta corrente">
          <TextInput value={draft.account} onChange={(event) => onChange({ ...draft, account: event.target.value })} aria-label="Conta corrente" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={draft.active}
          onChange={(event) => onChange({ ...draft, active: event.target.checked })}
        />
        Ativo
      </label>
      <Field label="Cartões de crédito" hint="Opcional. Um cartão só pode estar vinculado a um banco.">
        <CardMultiSelect
          cards={cards}
          selected={draft.cardIds}
          ownerOf={ownerOf}
          onChange={(cardIds) => onChange({ ...draft, cardIds })}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit">Salvar</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function CardMultiSelect({
  cards,
  selected,
  ownerOf,
  onChange,
}: {
  cards: CreditCard[]
  selected: string[]
  ownerOf: (cardId: string) => BankAccount | null
  onChange: (cardIds: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const chosen = cards.filter((card) => selected.includes(card.id))

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
      <button
        type="button"
        aria-label="Cartões de crédito"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2 text-left text-base outline-none focus:border-primary"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {chosen.length ? (
            chosen.map((card) => (
              <span key={card.id} className="inline-flex min-w-0 items-center gap-1.5">
                <CardMark color={card.color} />
                <span className="truncate">{card.name}</span>
              </span>
            ))
          ) : (
            <span className="text-muted-foreground">Nenhum cartão</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {open ? (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border bg-card p-1 shadow-md">
          {cards.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">Nenhum cartão cadastrado.</li> : null}
          {cards.map((card) => {
            const owner = ownerOf(card.id)
            const checked = selected.includes(card.id)
            return (
              <li key={card.id}>
                <label className={cn('flex items-center gap-2 rounded-lg px-2 py-2 text-sm', owner ? 'text-muted-foreground' : 'hover:bg-muted')}>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={checked}
                    disabled={Boolean(owner)}
                    onChange={() => onChange(checked ? selected.filter((id) => id !== card.id) : [...selected, card.id])}
                  />
                  <CardMark color={card.color} />
                  <span className="min-w-0 flex-1 truncate">{card.name}</span>
                  {owner ? <span className="shrink-0 text-xs">Vinculado a {institutionById(owner.institutionId)?.name ?? 'outro banco'}</span> : null}
                </label>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
