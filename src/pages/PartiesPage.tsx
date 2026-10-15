import { useState } from 'react'
import { normalizeCategoryName, resolveCategoryIcon } from '@/domain/category-icons'
import type { BankAccount, CreditCard, Party, PartyKind, PaymentMethod } from '@/domain/types'
import * as finance from '@/db/finance-repository'
import { useFinance } from '@/state/FinanceContext'
import { paymentChoices, paymentLabels } from '@/lib/labels'
import { CategoryGlyph, CategorySelect } from '@/components/finance/CategoryFields'
import { BankSelect, bankAccountLabel, bankForCard } from '@/components/finance/BankSelect'
import { CardSelect } from '@/components/finance/CardSelect'
import type { CategoryIcon } from '@/domain/category-icons'
import { Button } from '@/components/ui/button'
import { Field, SelectInput, TextInput } from '@/components/ui/field'
import { cn } from '@/lib/cn'

interface PartyDraft {
  description: string
  entryDescription: string
  categoryId: string
  paymentMethod: string
  bankId: string
  cardId: string
}

export function PartiesPage() {
  const { snapshot, mutate } = useFinance()
  const [kind, setKind] = useState<PartyKind>('establishment')
  const [description, setDescription] = useState('')
  const [entryDescription, setEntryDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [bankId, setBankId] = useState('')
  const [cardId, setCardId] = useState('')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PartyDraft | null>(null)
  const [creating, setCreating] = useState(false)

  function resetCreate() {
    setCreating(false)
    setDescription('')
    setEntryDescription('')
    setCategoryId('')
    setPaymentMethod('')
    setBankId('')
    setCardId('')
  }

  if (!snapshot) return <p>Carregando contatos...</p>

  const entryKind = kind === 'client' ? 'income' : 'expense'
  const categories = snapshot.categories
    .filter((category) => category.kind === entryKind && !category.archived)
    .map((category) => ({ ...category, icon: resolveCategoryIcon(category.icon, category.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const search = normalizeCategoryName(query)
  const visible = snapshot.parties
    .filter((party) => party.kind === kind)
    .filter((party) => party.id === editingId || !search || normalizeCategoryName(party.description).includes(search))
    .sort((a, b) => a.description.localeCompare(b.description, 'pt-BR'))

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Contatos</h1>
      </header>
      {message ? <p className="rounded-2xl bg-[#f8e8e8] px-4 py-3 text-sm text-expense">{message}</p> : null}

      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <div className={cn('grid grid-cols-2 gap-2', creating && 'pointer-events-none opacity-40')}>
          <button type="button" className={choice('client', kind === 'client')} onClick={() => { setKind('client'); setCategoryId(''); setEditingId(null) }}>
            Cliente
          </button>
          <button type="button" className={choice('establishment', kind === 'establishment')} onClick={() => { setKind('establishment'); setCategoryId(''); setEditingId(null) }}>
            Estabelecimento
          </button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Novo contato</h2>
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
            void mutate(
              () =>
                finance.saveParty({
                  kind,
                  description,
                  entryDescription,
                  categoryId,
                  paymentMethod: (paymentMethod || null) as PaymentMethod | null,
                  bankId: bankId || null,
                  cardId: paymentMethod === 'cartao' ? cardId || null : null,
                }),
              kind === 'client' ? 'Cliente adicionado.' : 'Estabelecimento adicionado.',
            )
              .then(() => {
                resetCreate()
                setMessage(null)
              })
              .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'))
          }}
        >
          <Field label="Descrição">
            <TextInput
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={kind === 'client' ? 'Nome do cliente' : 'Nome do estabelecimento'}
              aria-label="Descrição"
            />
          </Field>
          <PartyLinks
            entryDescription={entryDescription}
            categoryId={categoryId}
            paymentMethod={paymentMethod}
            bankId={bankId}
            cardId={cardId}
            banks={snapshot.banks}
            cards={snapshot.creditCards}
            categories={categories}
            kind={entryKind}
            onEntryDescription={setEntryDescription}
            onCategory={setCategoryId}
            onPayment={(value) => {
              setPaymentMethod(value)
              if (value !== 'cartao') setCardId('')
            }}
            onBank={setBankId}
            onCard={setCardId}
            onCreateCategory={async ({ name, icon }) => {
              const id = await mutate(() => finance.saveCategory({ name, kind: entryKind, icon }), 'Categoria adicionada.')
              setCategoryId(id)
            }}
          />
          <div className="flex gap-2">
            <Button type="submit">Salvar</Button>
            <Button type="button" variant="outline" onClick={resetCreate}>Cancelar</Button>
          </div>
        </form>
        ) : null}
        <TextInput
          className="mt-4"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar"
          aria-label="Buscar"
        />
        <ul className="mt-3 divide-y divide-border">
          {visible.length === 0 ? <li className="py-3 text-sm text-muted-foreground">Nenhum cadastro encontrado.</li> : null}
          {visible.map((party) => {
            const editing = editingId === party.id
            const locked = creating || (editingId !== null && !editing)
            if (editing && draft) {
              return (
                <li key={party.id} className="space-y-3 py-3">
                  <Field label="Descrição">
                    <TextInput value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} aria-label="Descrição" />
                  </Field>
                  <PartyLinks
                    entryDescription={draft.entryDescription}
                    categoryId={draft.categoryId}
                    paymentMethod={draft.paymentMethod}
                    bankId={draft.bankId}
                    cardId={draft.cardId}
                    banks={snapshot.banks}
                    cards={snapshot.creditCards}
                    categories={categories}
                    kind={entryKind}
                    onEntryDescription={(value) => setDraft({ ...draft, entryDescription: value })}
                    onCategory={(value) => setDraft({ ...draft, categoryId: value })}
                    onPayment={(value) => setDraft({ ...draft, paymentMethod: value, cardId: value === 'cartao' ? draft.cardId : '' })}
                    onBank={(value) => setDraft({ ...draft, bankId: value })}
                    onCard={(value) => setDraft({ ...draft, cardId: value })}
                    onCreateCategory={async ({ name, icon }) => {
                      const id = await mutate(() => finance.saveCategory({ name, kind: entryKind, icon }), 'Categoria adicionada.')
                      setDraft((current) => (current ? { ...current, categoryId: id } : current))
                    }}
                  />
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        void mutate(
                          () =>
                            finance.saveParty({
                              id: party.id,
                              kind: party.kind,
                              description: draft.description,
                              entryDescription: draft.entryDescription,
                              categoryId: draft.categoryId,
                              paymentMethod: (draft.paymentMethod || null) as PaymentMethod | null,
                              bankId: draft.bankId || null,
                              cardId: draft.paymentMethod === 'cartao' ? draft.cardId || null : null,
                            }),
                          'Cadastro atualizado.',
                        )
                          .then(() => setEditingId(null))
                          .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'))
                      }
                    >
                      Salvar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </li>
              )
            }
            return (
              <li key={party.id} className={cn('flex items-center justify-between gap-3 py-3', locked && 'pointer-events-none opacity-40')}>
                <span className="min-w-0">
                  <span className="block truncate">{party.description}</span>
                  <PartyBadges party={party} categories={categories} banks={snapshot.banks} cards={snapshot.creditCards} />
                </span>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={locked}
                    onClick={() => {
                      setEditingId(party.id)
                      setDraft({
                        description: party.description,
                        entryDescription: party.entryDescription ?? '',
                        categoryId: party.categoryId ?? '',
                        paymentMethod: party.paymentMethod ?? '',
                        bankId: snapshot.banks.some((bank) => bank.id === party.bankId && bank.active !== false) ? party.bankId ?? '' : '',
                        cardId: party.paymentMethod === 'cartao' && snapshot.creditCards.some((card) => card.id === party.cardId && card.active !== false) ? party.cardId ?? '' : '',
                      })
                      setMessage(null)
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={locked}
                    onClick={() =>
                      void mutate(() => finance.deleteParty(party.id), 'Cadastro excluído.').catch((error: unknown) =>
                        setMessage(error instanceof Error ? error.message : 'Não foi possível excluir.'),
                      )
                    }
                  >
                    Excluir
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function PartyLinks({
  entryDescription,
  categoryId,
  paymentMethod,
  bankId,
  cardId,
  banks,
  cards,
  categories,
  kind,
  disabled,
  onEntryDescription,
  onCategory,
  onPayment,
  onBank,
  onCard,
  onCreateCategory,
}: {
  entryDescription: string
  categoryId: string
  paymentMethod: string
  bankId: string
  cardId: string
  banks: BankAccount[]
  cards: CreditCard[]
  categories: { id: string; name: string; icon: CategoryIcon }[]
  kind: 'income' | 'expense'
  disabled?: boolean
  onEntryDescription: (value: string) => void
  onCategory: (value: string) => void
  onPayment: (value: string) => void
  onBank: (value: string) => void
  onCard: (value: string) => void
  onCreateCategory: (input: { name: string; icon: CategoryIcon }) => Promise<void>
}) {
  return (
    <>
      <Field label="Descrição da receita/despesa" hint="Opcional. Preenche a descrição do lançamento.">
        <TextInput
          value={entryDescription}
          onChange={(event) => onEntryDescription(event.target.value)}
          aria-label="Descrição da receita/despesa"
          disabled={disabled}
        />
      </Field>
      <Field label="Categoria" hint="Opcional">
        <CategorySelect
          categories={categories}
          value={categoryId}
          onChange={onCategory}
          kind={kind}
          emptyLabel="Não vincular"
          disabled={disabled}
          onCreate={onCreateCategory}
        />
      </Field>
      <Field label="Banco" hint={paymentMethod === 'cartao' && bankForCard(banks, cardId) ? 'Definido pelo cartão.' : 'Opcional. Preenche o banco do lançamento.'}>
        <BankSelect
          banks={banks}
          value={bankId}
          onChange={onBank}
          ariaLabel="Banco do contato"
          disabled={Boolean(disabled || (paymentMethod === 'cartao' && bankForCard(banks, cardId)))}
        />
      </Field>
      <Field label="Forma de pagamento" hint="Opcional">
        <SelectInput value={paymentMethod} aria-label="Forma de pagamento do contato" onChange={(event) => onPayment(event.target.value)} disabled={disabled}>
          <option value="">Não vincular</option>
          {paymentChoices.map((value) => (
            <option key={value} value={value}>
              {paymentLabels[value]}
            </option>
          ))}
        </SelectInput>
      </Field>
      {paymentMethod === 'cartao' ? (
        <Field label="Cartão" hint="Opcional. Preenche o cartão do lançamento.">
          <CardSelect
            cards={cards.filter((card) => card.active !== false)}
            value={cardId}
            onChange={(nextCard) => {
              onCard(nextCard)
              const owner = bankForCard(banks, nextCard)
              if (owner) onBank(owner.id)
            }}
            emptyLabel="Não vincular"
            ariaLabel="Cartão do contato"
            disabled={disabled}
          />
        </Field>
      ) : null}
    </>
  )
}

function PartyBadges({
  party,
  categories,
  banks,
  cards,
}: {
  party: Party
  categories: { id: string; name: string; icon: CategoryIcon }[]
  banks: BankAccount[]
  cards: CreditCard[]
}) {
  const category = categories.find((item) => item.id === party.categoryId)
  const bank = banks.find((item) => item.id === party.bankId && item.active !== false)
  const card = cards.find((item) => item.id === party.cardId && item.active !== false)
  const links = [
    party.entryDescription ? { key: 'description', label: party.entryDescription, className: 'bg-muted text-muted-foreground' } : null,
    category ? { key: 'category', label: category.name, icon: category.icon, className: 'bg-secondary text-income' } : null,
    party.paymentMethod
      ? { key: 'payment', label: paymentLabels[party.paymentMethod], className: 'bg-[#e7eef8] text-[#2c4c78]' }
      : null,
    bank ? { key: 'bank', label: bankAccountLabel(bank), className: 'bg-[#eef3f8] text-[#24384f]' } : null,
    card ? { key: 'card', label: card.name, className: 'bg-[#f3eefe] text-[#4c3d78]' } : null,
  ].filter((item) => item !== null)
  if (!links.length) return null
  return (
    <span className="mt-1.5 flex flex-wrap gap-1.5">
      {links.map((item) => (
        <span key={item.key} className={cn('inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', item.className)}>
          {'icon' in item && item.icon ? <CategoryGlyph icon={item.icon} className="h-3.5 w-3.5" /> : null}
          <span className="truncate">{item.label}</span>
        </span>
      ))}
    </span>
  )
}

function choice(type: PartyKind, active: boolean) {
  const base = 'h-12 rounded-xl border font-semibold'
  if (type === 'client') {
    return active ? `${base} border-primary bg-primary text-white` : `${base} border-primary bg-card text-income`
  }
  return active ? `${base} border-foreground bg-foreground text-white` : `${base} border-border bg-card text-foreground`
}
