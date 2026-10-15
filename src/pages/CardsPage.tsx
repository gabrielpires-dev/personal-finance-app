import { useState } from 'react'
import { cardColors, cardGradient, defaultCardColor, resolveCardColor } from '@/domain/card-colors'
import { centsToInput, parseMoneyInput } from '@/domain/money'
import * as finance from '@/db/finance-repository'
import { useFinance } from '@/state/FinanceContext'
import { Button } from '@/components/ui/button'
import { Field, TextInput } from '@/components/ui/field'
import { BrandMark, BrandSelect, matchCardBrand } from '@/components/finance/CardBrandSelect'
import { MoneyInput } from '@/components/finance/MoneyInput'
import { Money } from '@/components/finance/Money'
import { cn } from '@/lib/cn'

export function CardsPage() {
  const { snapshot, mutate } = useFinance()
  const [message, setMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [cardName, setCardName] = useState('')
  const [brand, setBrand] = useState('')
  const [color, setColor] = useState(defaultCardColor)
  const [limit, setLimit] = useState('')
  const [closingDay, setClosingDay] = useState('10')
  const [dueDay, setDueDay] = useState('17')
  const [active, setActive] = useState(true)
  const [creating, setCreating] = useState(false)

  function resetForm() {
    setEditingId(null)
    setCreating(false)
    setCardName('')
    setBrand('')
    setColor(defaultCardColor)
    setLimit('')
    setClosingDay('10')
    setDueDay('17')
    setActive(true)
  }

  if (!snapshot) return <p>Carregando cartões...</p>

  const totalLimitCents = snapshot.creditCards.reduce((sum, card) => {
    if (card.active === false || card.limitCents == null) return sum
    return sum + card.limitCents
  }, 0)

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">Cartões</h1>
        <p className="pt-1 text-right text-xs text-muted-foreground">
          Limite total
          <span className="mt-0.5 block text-sm font-semibold text-foreground">
            <Money cents={totalLimitCents} />
          </span>
        </p>
      </header>
      {message ? <p className="rounded-2xl bg-[#f8e8e8] px-4 py-3 text-sm text-expense">{message}</p> : null}

      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{editingId ? 'Editar cartão' : 'Novo cartão'}</h2>
          {creating || editingId ? null : (
            <Button type="button" size="sm" onClick={() => { resetForm(); setCreating(true); setMessage(null) }}>
              Novo
            </Button>
          )}
        </div>
        {creating || editingId ? (
        <form
          id="cartao-form"
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            const limitCents = limit.trim() ? parseMoneyInput(limit) : null
            if (limit.trim() && !limitCents) {
              setMessage('Informe o limite como valor em reais ou deixe em branco.')
              return
            }
            void mutate(
              () =>
                finance.saveCard({
                  id: editingId ?? undefined,
                  name: cardName,
                  brand: brand || null,
                  color,
                  limitCents,
                  closingDay: Number(closingDay),
                  dueDay: Number(dueDay),
                  active,
                }),
              editingId ? 'Cartão atualizado.' : 'Cartão salvo.',
            ).then(() => {
              resetForm()
              setMessage(null)
            })
          }}
        >
          <Field label="Nome">
            <TextInput value={cardName} onChange={(event) => setCardName(event.target.value)} required />
          </Field>
          <Field label="Bandeira">
            <BrandSelect value={brand} onChange={setBrand} />
          </Field>
          <Field label="Fechamento">
            <TextInput value={closingDay} onChange={(event) => setClosingDay(event.target.value)} type="number" min={1} max={31} inputMode="numeric" required />
          </Field>
          <Field label="Vencimento">
            <TextInput value={dueDay} onChange={(event) => setDueDay(event.target.value)} type="number" min={1} max={31} inputMode="numeric" required />
          </Field>
          <Field label="Limite" hint="Opcional">
            <MoneyInput value={limit} onChange={setLimit} aria-label="Limite" />
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-semibold">Cor</p>
            <div className="flex flex-wrap gap-2" role="listbox" aria-label="Cor do cartão">
              {cardColors.map((option) => {
                const selected = color === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-label={option.label}
                    title={option.label}
                    className={cn('h-10 w-10 rounded-xl border-2 shadow-sm', selected ? 'border-foreground' : 'border-transparent')}
                    style={{ background: cardGradient(option.id) }}
                    onClick={() => setColor(option.id)}
                  />
                )
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <input type="checkbox" className="h-4 w-4" checked={active} onChange={(event) => setActive(event.target.checked)} />
            Ativo
          </label>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button type="submit">Salvar</Button>
            <Button type="button" variant="outline" onClick={resetForm}>
              Cancelar
            </Button>
          </div>
        </form>
        ) : null}
      </section>

      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Cartões cadastrados</h2>
        <ul className="mt-4 space-y-3">
          {snapshot.creditCards.length === 0 ? <li className="text-sm text-muted-foreground">Nenhum cartão cadastrado.</li> : null}
          {snapshot.creditCards.map((card) => {
            const knownBrand = matchCardBrand(card.brand)
            const locked = creating || (editingId !== null && editingId !== card.id)
            return (
            <li key={card.id} className={cn('overflow-hidden rounded-3xl shadow-md', editingId === card.id && 'ring-2 ring-primary ring-offset-2', locked && 'pointer-events-none opacity-40')}>
              <div className="relative min-h-40 px-5 py-5 text-white" style={{ background: cardGradient(card.color) }}>
                <div className="pointer-events-none absolute -right-6 -top-10 h-36 w-36 rounded-full bg-white/20 blur-2xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <p className="text-lg font-semibold tracking-tight">
                    {card.name}{card.demo ? ' · exemplo' : ''}
                    {card.active === false ? <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">Inativo</span> : null}
                  </p>
                  {knownBrand ? <BrandMark brand={knownBrand.id} className="h-7 w-11" /> : null}
                </div>
                <p className="relative mt-6 text-2xl font-semibold tabular-nums">
                  {card.limitCents ? <Money cents={card.limitCents} /> : 'Sem limite'}
                </p>
                <p className="relative mt-4 text-sm text-white/85">
                  Fecha dia {card.closingDay} · vence dia {card.dueDay}
                  {card.brand ? ` · ${card.brand}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 bg-card px-3 py-3">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={creating || editingId !== null}
                    onClick={() => {
                      setCreating(false)
                      setEditingId(card.id)
                      setCardName(card.name)
                      setBrand(card.brand ?? '')
                      setColor(resolveCardColor(card.color))
                      setLimit(card.limitCents ? centsToInput(card.limitCents) : '')
                      setClosingDay(String(card.closingDay))
                      setDueDay(String(card.dueDay))
                      setActive(card.active !== false)
                      setMessage(null)
                      document.getElementById('cartao-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                  >
                    Editar
                  </Button>
                  <Button size="sm" variant="outline" disabled={creating || editingId !== null} onClick={() => void mutate(() => finance.saveCard({ ...card, color: resolveCardColor(card.color), active: !card.active }))}>
                    {card.active ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={creating || editingId !== null}
                    onClick={() =>
                      void mutate(() => finance.deleteCard(card.id)).catch((error: unknown) =>
                        setMessage(error instanceof Error ? error.message : 'Não foi possível excluir o cartão.'),
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
