import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { addMonthsISO, competenceOf, currentCompetence, dateISO, daysInMonth, formatDateBR, isCompetence, shiftCompetence } from '@/domain/dates'
import { allocatePurchase } from '@/domain/invoices'
import { planInstallments } from '@/domain/installments'
import { buildOccurrences } from '@/domain/recurrence'
import { resolveCategoryIcon } from '@/domain/category-icons'
import { parseMoneyInput } from '@/domain/money'
import type { CreditCard, EntryKind, Frequency, PaymentMethod, Recurrence } from '@/domain/types'
import * as finance from '@/db/finance-repository'
import { useFinance } from '@/state/FinanceContext'
import { frequencyLabels, paymentChoices, paymentLabels } from '@/lib/labels'
import { competenceLabel } from '@/components/finance/CompetenceSwitcher'
import { CategorySelect } from '@/components/finance/CategoryFields'
import { CardSelect } from '@/components/finance/CardSelect'
import { CalendarDateField } from '@/components/finance/CalendarDateField'
import { parseBrDate } from '@/components/finance/DateInput'
import { MoneyInput } from '@/components/finance/MoneyInput'
import { Button } from '@/components/ui/button'
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/field'
import { LimitedSelect } from '@/components/ui/limited-select'
import { BankSelect, bankForCard } from '@/components/finance/BankSelect'

const schema = z.object({
  kind: z.enum(['income', 'expense']),
  description: z.string().trim().min(2, 'Informe uma descrição.'),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data de lançamento.'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe o vencimento.'),
  party: z.string(),
  bankId: z.string(),
  categoryId: z.string().min(1, 'Escolha uma categoria.'),
  amount: z.string(),
  paymentMethod: z.string(),
  cardId: z.string(),
  notes: z.string(),
  occurrence: z.enum(['single', 'recurring', 'installment']),
  frequency: z.enum(['monthly', 'yearly', 'weekly', 'biweekly']),
  dueDay: z.coerce.number().int().min(1).max(31),
  endDate: z.string(),
  installmentCount: z.coerce.number().int().min(1).max(60),
})

export function NewEntryPage() {
  const { snapshot, competence, mutate } = useFinance()
  const location = useLocation()
  const navigate = useNavigate()
  const launch = readLaunch(location.state)
  const [kind, setKind] = useState<EntryKind>(launch.kind)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [occurrence, setOccurrence] = useState<'single' | 'recurring' | 'installment'>('single')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [savedCompetence, setSavedCompetence] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [categoryId, setCategoryId] = useState('')
  const [party, setParty] = useState('')
  const [bankId, setBankId] = useState('')
  const [cardId, setCardId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [month, setMonth] = useState(() => launch.month ?? defaultEntryMonth(snapshot))
  const monthChosen = useRef(Boolean(launch.month))
  const returnToMonth = launch.returnToMonth
  const [day, setDay] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endCompetence, setEndCompetence] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [installmentCount, setInstallmentCount] = useState('2')

  const categories = (snapshot?.categories ?? [])
    .filter((category) => category.kind === kind && !category.archived)
    .map((category) => ({ ...category, icon: resolveCategoryIcon(category.icon, category.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const cards = (snapshot?.creditCards ?? []).filter((card) => card.active !== false)
  const partyKind = kind === 'income' ? 'client' : 'establishment'
  const parties = (snapshot?.parties ?? [])
    .filter((item) => item.kind === partyKind)
    .sort((a, b) => a.description.localeCompare(b.description, 'pt-BR'))
  const cardPayment = kind === 'expense' && paymentMethod === 'cartao'
  const showCard = paymentMethod === 'cartao'
  const cardSchedule = cardPayment ? cards.find((card) => card.id === cardId) ?? null : null

  useEffect(() => {
    if (!categories.some((category) => category.id === categoryId)) {
      setCategoryId(categories[0]?.id ?? '')
    }
  }, [categories, categoryId])

  useEffect(() => {
    if (party && !parties.some((item) => item.description === party)) setParty('')
  }, [parties, party])

  useEffect(() => {
    if (monthChosen.current || !snapshot) return
    setMonth(defaultEntryMonth(snapshot))
  }, [snapshot])

  function applyParty(value: string) {
    setParty(value)
    const selected = parties.find((item) => item.description === value)
    if (!selected) {
      setBankId('')
      setCardId('')
      return
    }
    if (selected.entryDescription) setDescription(selected.entryDescription)
    if (selected.categoryId && categories.some((category) => category.id === selected.categoryId)) {
      setCategoryId(selected.categoryId)
    }
    setPaymentMethod(selected.paymentMethod ?? '')
    const activeCard = cards.find((card) => card.id === selected.cardId)
    const nextCard = selected.paymentMethod === 'cartao' && activeCard ? activeCard.id : ''
    setCardId(nextCard)
    const linked = (snapshot?.banks ?? []).find((bank) => bank.id === selected.bankId && bank.active !== false)
    const owner = nextCard
      ? (snapshot?.banks ?? []).find((bank) => bank.active !== false && bank.cardIds.includes(nextCard))
      : undefined
    setBankId(owner?.id ?? linked?.id ?? '')
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const raw = Object.fromEntries(form.entries())
    const selectedDate = dateFromMonthDay(month, day)
    const resolvedEnd = resolveEndDate(occurrence, day, endDate, endCompetence, month)
    if (resolvedEnd === null) {
      setErrors({
        endDate: day ? 'Escolha uma data a partir do lançamento.' : 'Escolha um mês a partir do lançamento.',
      })
      return
    }
    const parsed = schema.safeParse({
      ...raw,
      kind,
      description,
      categoryId,
      entryDate: selectedDate,
      dueDate: selectedDate,
      occurrence,
      paymentMethod,
      cardId,
      frequency: raw.frequency || 'monthly',
      endDate: resolvedEnd,
      notes: raw.notes || '',
      party,
      bankId,
      amount,
      installmentCount: raw.installmentCount || 1,
      dueDay: day ? Number(day) : Number(selectedDate.slice(8, 10)),
    })
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message
      setErrors(next)
      return
    }
    const cents = parseMoneyInput(parsed.data.amount)
    if (!cents) {
      setErrors({ amount: 'Informe um valor maior que zero.' })
      return
    }
    if (showCard && !parsed.data.cardId) {
      setErrors({ cardId: 'Escolha o cartão da despesa.' })
      return
    }
    if (parsed.data.occurrence === 'installment' && parsed.data.installmentCount < 2) {
      setErrors({ installmentCount: 'Informe pelo menos 2 parcelas.' })
      return
    }
    setSaving(true)
    setErrors({})
    try {
      if (cardPayment && parsed.data.occurrence === 'recurring') {
        await mutate(() =>
          finance.addRecurrence({
            kind: 'expense',
            description: parsed.data.description,
            categoryId: parsed.data.categoryId,
            amountCents: cents,
            startDate:
              parsed.data.frequency === 'weekly' || parsed.data.frequency === 'biweekly'
                ? parsed.data.dueDate
                : `${parsed.data.dueDate.slice(0, 7)}-01`,
            frequency: parsed.data.frequency as Frequency,
            dueDay: parsed.data.frequency === 'weekly' || parsed.data.frequency === 'biweekly' ? Number(parsed.data.dueDate.slice(8)) : parsed.data.dueDay,
            endDate: parsed.data.endDate || null,
            active: true,
            party: parsed.data.party || null,
            paymentMethod: 'cartao',
            bankId: parsed.data.bankId || null,
            cardId: parsed.data.cardId,
            notes: parsed.data.notes || null,
          }),
        )
      } else if (cardPayment) {
        await mutate(() =>
          finance.addPurchase({
            cardId: parsed.data.cardId,
            description: parsed.data.description,
            categoryId: parsed.data.categoryId,
            party: parsed.data.party || null,
            bankId: parsed.data.bankId || null,
            purchaseDate: parsed.data.entryDate,
            totalCents: cents,
            installmentCount: parsed.data.occurrence === 'installment' ? parsed.data.installmentCount : 1,
            notes: parsed.data.notes || null,
          }),
        )
      } else if (parsed.data.occurrence === 'recurring') {
        await mutate(() =>
          finance.addRecurrence({
            kind: parsed.data.kind,
            description: parsed.data.description,
            categoryId: parsed.data.categoryId,
            amountCents: cents,
            startDate:
              parsed.data.frequency === 'weekly' || parsed.data.frequency === 'biweekly'
                ? parsed.data.dueDate
                : `${parsed.data.dueDate.slice(0, 7)}-01`,
            frequency: parsed.data.frequency as Frequency,
            dueDay: parsed.data.frequency === 'weekly' || parsed.data.frequency === 'biweekly' ? Number(parsed.data.dueDate.slice(8)) : parsed.data.dueDay,
            endDate: parsed.data.endDate || null,
            active: true,
            party: parsed.data.party || null,
            paymentMethod: (parsed.data.paymentMethod || null) as PaymentMethod | null,
            bankId: parsed.data.bankId || null,
            cardId: parsed.data.kind === 'income' && parsed.data.paymentMethod === 'cartao' ? parsed.data.cardId || null : null,
            notes: parsed.data.notes || null,
          }),
        )
      } else if (parsed.data.occurrence === 'installment') {
        await mutate(() =>
          finance.addInstallmentPlan({
            kind: parsed.data.kind,
            description: parsed.data.description,
            categoryId: parsed.data.categoryId,
            totalCents: cents,
            count: parsed.data.installmentCount,
            firstDueDate: parsed.data.dueDate,
            party: parsed.data.party || null,
            paymentMethod: (parsed.data.paymentMethod || null) as PaymentMethod | null,
            bankId: parsed.data.bankId || null,
            cardId: parsed.data.kind === 'income' && parsed.data.paymentMethod === 'cartao' ? parsed.data.cardId || null : null,
            notes: parsed.data.notes || null,
          }),
        )
      } else {
        await mutate(() =>
          finance.addTransaction({
            kind: parsed.data.kind,
            description: parsed.data.description,
            categoryId: parsed.data.categoryId,
            party: parsed.data.party,
            entryDate: parsed.data.entryDate,
            dueDate: parsed.data.dueDate,
            amountCents: cents,
            paymentMethod: (parsed.data.paymentMethod || null) as PaymentMethod | null,
            bankId: parsed.data.bankId || null,
            cardId: parsed.data.kind === 'income' && parsed.data.paymentMethod === 'cartao' ? parsed.data.cardId || null : null,
            notes: parsed.data.notes,
          }),
        )
      }
      const landed = titleCompetence(parsed.data, cardPayment ? cards.find((item) => item.id === parsed.data.cardId) ?? null : null)
      if (returnToMonth) {
        navigate(`/mes?c=${landed}&f=${parsed.data.kind}`)
        return
      }
      setSavedCompetence(landed)
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : 'Não foi possível salvar.' })
    } finally {
      setSaving(false)
    }
  }

  if (!snapshot) return <p>Carregando formulário...</p>

  if (savedCompetence) {
    return (
      <section className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-5 shadow-sm">
        <h1 className="text-2xl font-semibold">Lançamento salvo</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ele foi gravado no arquivo do servidor e continua disponível ao abrir a aplicação de novo.</p>
        <div className="mt-5 flex flex-col gap-2">
          <Button
            onClick={() => {
              setSavedCompetence(null)
              setFormKey((current) => current + 1)
              monthChosen.current = false
              setMonth(defaultEntryMonth(snapshot))
              setDay('')
              setAmount('')
              setEndDate('')
              setEndCompetence('')
              setFrequency('monthly')
              setInstallmentCount('2')
              setDescription('')
              setParty('')
              setBankId('')
              setCardId('')
              setPaymentMethod('')
            }}
          >
            Adicionar outro
          </Button>
          <Link to={`/mes?c=${competence}`} className="inline-flex h-11 items-center justify-center rounded-xl border border-border font-semibold">
            Voltar para {competenceLabel(competence)}
          </Link>
          <Link to={`/mes?c=${savedCompetence}`} className="inline-flex h-11 items-center justify-center rounded-xl font-semibold text-income">
            Abrir {competenceLabel(savedCompetence)}
          </Link>
        </div>
      </section>
    )
  }

  return (
    <form key={formKey} className="mx-auto max-w-lg space-y-4" onSubmit={onSubmit}>
      <div>
        <h1 className="text-2xl font-semibold">Novo lançamento</h1>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={choice('income', kind === 'income')} onClick={() => { setKind('income'); setPaymentMethod(''); setCardId(''); setBankId('') }}>
          Receita
        </button>
        <button type="button" className={choice('expense', kind === 'expense')} onClick={() => setKind('expense')}>
          Despesa
        </button>
      </div>
      <Field label={kind === 'income' ? 'Cliente' : 'Estabelecimento'}>
        <SelectInput
          value={party}
          aria-label={kind === 'income' ? 'Cliente' : 'Estabelecimento'}
          onChange={(event) => applyParty(event.target.value)}
        >
          <option value="">Não informar</option>
          {parties.map((item) => (
            <option key={item.id} value={item.description}>
              {item.description}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="Banco" hint={showCard && bankForCard(snapshot?.banks ?? [], cardId) ? 'Definido pelo cartão.' : 'Opcional. Vem preenchido quando o contato tem um banco.'}>
        <BankSelect
          banks={snapshot?.banks ?? []}
          value={bankId}
          onChange={setBankId}
          emptyLabel="Não informar"
          disabled={Boolean(showCard && bankForCard(snapshot?.banks ?? [], cardId))}
        />
      </Field>
      <Field label="Descrição" error={errors.description}>
        <TextInput
          name="description"
          required
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={kind === 'income' ? 'Salário' : 'Aluguel'}
        />
      </Field>
      <Field label="Mês">
        <LimitedSelect
          value={month}
          ariaLabel="Mês"
          options={monthChoices(currentCompetence(), [competence, month]).map((option) => ({ value: option, label: competenceLabel(option) }))}
          onChange={(nextMonth) => {
            monthChosen.current = true
            setMonth(nextMonth)
            if (day && Number(day) > daysInMonth(Number(nextMonth.slice(0, 4)), Number(nextMonth.slice(5)))) {
              setDay('')
            }
            if (endCompetence && endCompetence < nextMonth) setEndCompetence('')
            if (day && endDate) {
              const iso = parseBrDate(endDate)
              if (iso && iso < dateFromMonthDay(nextMonth, day)) setEndDate('')
            }
          }}
        />
      </Field>
      <Field label="Dia">
        <SelectInput
          value={day}
          aria-label="Dia"
          onChange={(event) => {
            const nextDay = event.target.value
            if (!nextDay && endDate) {
              const iso = parseBrDate(endDate)
              if (iso) setEndCompetence(iso.slice(0, 7))
              setEndDate('')
            }
            if (nextDay && endCompetence) {
              setEndDate(formatBrDate(lastDayOfCompetence(endCompetence)))
              setEndCompetence('')
            }
            if (nextDay && endDate) {
              const iso = parseBrDate(endDate)
              if (iso && iso < dateFromMonthDay(month, nextDay)) setEndDate('')
            }
            setDay(nextDay)
          }}
        >
          <option value="">Não informar</option>
          {Array.from({ length: daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5))) }, (_, index) => {
            const value = String(index + 1)
            return (
              <option key={value} value={value}>
                {value}
              </option>
            )
          })}
        </SelectInput>
      </Field>
      <Field label="Categoria" error={errors.categoryId}>
        <CategorySelect
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
          name="categoryId"
          kind={kind}
          onCreate={async ({ name, icon }) => {
            const id = await mutate(() => finance.saveCategory({ name, kind, icon }), 'Categoria adicionada.')
            setCategoryId(id)
          }}
        />
      </Field>
      <Field label="Valor" error={errors.amount}>
        <MoneyInput value={amount} onChange={setAmount} aria-label="Valor" required />
      </Field>
      <Field label="Forma de pagamento" error={errors.cardId}>
        <SelectInput
          name="paymentMethodSelect"
          value={paymentMethod}
          onChange={(event) => {
            setPaymentMethod(event.target.value)
            if (event.target.value !== 'cartao') setCardId('')
          }}
        >
          <option value="">Não informada</option>
          {paymentChoices.map((value) => (
            <option key={value} value={value}>
              {paymentLabels[value]}
            </option>
          ))}
        </SelectInput>
      </Field>
      {showCard ? (
        <Field label="Cartão" error={errors.cardId} hint={cardPayment ? 'A compra entra na fatura do cartão.' : 'O cartão fica registrado neste recebimento.'}>
          <CardSelect
            cards={cards}
            value={cardId}
            onChange={(nextCard) => {
              setCardId(nextCard)
              const owner = bankForCard(snapshot?.banks ?? [], nextCard)
              if (owner) setBankId(owner.id)
            }}
          />
        </Field>
      ) : null}
      <Field label="Ocorrência">
        <SelectInput value={occurrence} onChange={(event) => setOccurrence(event.target.value as typeof occurrence)}>
          <option value="single">Avulsa</option>
          <option value="recurring">Recorrente</option>
          <option value="installment">Parcelada</option>
        </SelectInput>
      </Field>
      {occurrence === 'recurring' ? (
        <>
          <Field label="Frequência">
            <SelectInput name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as Frequency)}>
              {Object.entries(frequencyLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field
            label="Encerrar em"
            hint={day ? 'Opcional' : 'Opcional. A recorrência segue até o último dia do mês escolhido.'}
            error={errors.endDate}
          >
            {day ? (
              <CalendarDateField value={endDate} onChange={setEndDate} minDate={dateFromMonthDay(month, day)} aria-label="Encerrar em" />
            ) : (
              <LimitedSelect
                value={endCompetence}
                ariaLabel="Encerrar em"
                options={[
                  { value: '', label: 'Não encerrar' },
                  ...endMonthChoices(month).map((option) => ({ value: option, label: competenceLabel(option) })),
                ]}
                onChange={setEndCompetence}
              />
            )}
          </Field>
          <SchedulePreview
            dates={recurringPreview(frequency, dateFromMonthDay(month, day), resolveEndDate(occurrence, day, endDate, endCompetence, month) || null, cardSchedule)}
            waitingCard={cardPayment && !cardSchedule}
          />
        </>
      ) : null}
      {occurrence === 'installment' ? (
        <Field label="Quantidade de parcelas" error={errors.installmentCount} hint="O intervalo é mensal. O valor total é dividido em centavos, sem perder o total.">
          <TextInput
            name="installmentCount"
            type="number"
            min={2}
            max={60}
            inputMode="numeric"
            value={installmentCount}
            onChange={(event) => setInstallmentCount(event.target.value)}
          />
        </Field>
      ) : null}
      {occurrence === 'installment' ? (
        <SchedulePreview dates={installmentPreview(installmentCount, dateFromMonthDay(month, day), cardSchedule)} waitingCard={cardPayment && !cardSchedule} />
      ) : null}
      <Field label="Observações">
        <TextArea name="notes" />
      </Field>
      {errors.form ? <p role="alert" className="text-sm text-expense">{errors.form}</p> : null}
      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? 'Salvando...' : 'Salvar lançamento'}
      </Button>
    </form>
  )
}

function resolveEndDate(occurrence: string, day: string, endDate: string, endCompetence: string, month: string) {
  if (occurrence !== 'recurring') return ''
  if (!day) {
    if (!endCompetence) return ''
    if (endCompetence < month) return null
    return lastDayOfCompetence(endCompetence)
  }
  if (!endDate) return ''
  const iso = parseBrDate(endDate)
  if (!iso || iso < dateFromMonthDay(month, day)) return null
  return iso
}

function lastDayOfCompetence(competence: string) {
  const year = Number(competence.slice(0, 4))
  const monthNumber = Number(competence.slice(5))
  return dateISO(year, monthNumber, daysInMonth(year, monthNumber))
}

function formatBrDate(iso: string) {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

function endMonthChoices(from: string) {
  return Array.from({ length: 96 }, (_, index) => shiftCompetence(from, index))
}

function dateFromMonthDay(month: string, day: string) {
  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5))
  return dateISO(year, monthNumber, day ? Number(day) : daysInMonth(year, monthNumber))
}

function readLaunch(state: unknown) {
  const value = state && typeof state === 'object' ? (state as { kind?: unknown; month?: unknown; returnToMonth?: unknown }) : {}
  return {
    kind: value.kind === 'income' ? 'income' : 'expense',
    month: typeof value.month === 'string' && isCompetence(value.month) ? value.month : null,
    returnToMonth: value.returnToMonth === true,
  } satisfies { kind: EntryKind; month: string | null; returnToMonth: boolean }
}

function titleCompetence(
  data: { occurrence: string; dueDate: string; entryDate: string; installmentCount: number },
  card: CreditCard | null,
) {
  if (card && data.occurrence === 'installment') {
    const preview = installmentPreview(String(data.installmentCount), data.entryDate, card)
    return competenceOf(preview?.first ?? data.entryDate)
  }
  if (card) return competenceOf(postedDate(data.dueDate, card))
  return competenceOf(data.dueDate)
}

function defaultEntryMonth(snapshot: { settings: { favoriteCompetence?: string | null } } | null) {
  const saved = snapshot?.settings.favoriteCompetence
  return saved && isCompetence(saved) ? saved : currentCompetence()
}

function monthChoices(current: string, extras: string[]) {
  const start = shiftCompetence(current, -12)
  const options = Array.from({ length: 37 }, (_, index) => shiftCompetence(start, index))
  for (const extra of extras) {
    if (extra && !options.includes(extra)) options.push(extra)
  }
  return options.sort()
}

function SchedulePreview({
  dates,
  waitingCard,
}: {
  dates: { first: string; last: string | null } | null
  waitingCard: boolean
}) {
  if (waitingCard) {
    return (
      <div className="grid grid-cols-2 gap-2" aria-label="Prévia das datas">
        <PreviewDate label="Primeiro" month="Escolha o cartão" quiet />
        <PreviewDate label="Último" month="Escolha o cartão" quiet />
      </div>
    )
  }
  if (!dates) return null
  return (
    <div className="grid grid-cols-2 gap-2" aria-label="Prévia das datas">
      <PreviewDate label="Primeiro" month={competenceLabel(competenceOf(dates.first))} day={formatDateBR(dates.first)} />
      <PreviewDate
        label="Último"
        month={dates.last ? competenceLabel(competenceOf(dates.last)) : 'Sem término'}
        day={dates.last ? formatDateBR(dates.last) : null}
        quiet={!dates.last}
      />
    </div>
  )
}

function PreviewDate({ label, month, day = null, quiet = false }: { label: string; month: string; day?: string | null; quiet?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/70 px-2.5 py-1.5">
      <p className="text-[11px] leading-4 text-muted-foreground">{label}</p>
      <p className={quiet ? 'truncate text-xs text-muted-foreground' : 'truncate text-sm font-medium'}>{month}</p>
      {day ? <p className="truncate text-[11px] leading-4 text-muted-foreground">{day}</p> : null}
    </div>
  )
}

function recurringPreview(frequency: Frequency, selectedDate: string, endDate: string | null, card: CreditCard | null) {
  const weekly = frequency === 'weekly' || frequency === 'biweekly'
  const startDate = weekly ? selectedDate : `${selectedDate.slice(0, 7)}-01`
  const dueDay = Number(selectedDate.slice(8, 10))
  const recurrence = previewRecurrence(frequency, startDate, dueDay, endDate)
  const firstRangeEnd = endDate ?? addMonthsISO(startDate, frequency === 'yearly' ? 14 : 2)
  const first = buildOccurrences(recurrence, startDate, firstRangeEnd)[0]?.dueDate
  if (!first) return null
  const lastDue = endDate ? (buildOccurrences(recurrence, startDate, endDate).at(-1)?.dueDate ?? null) : null
  return {
    first: postedDate(first, card),
    last: lastDue ? postedDate(lastDue, card) : null,
  }
}

function installmentPreview(rawCount: string, selectedDate: string, card: CreditCard | null) {
  const count = Number(rawCount)
  if (!Number.isInteger(count) || count < 2 || count > 60) return null
  if (card) {
    const items = allocatePurchase(previewPurchase(selectedDate, count, card.id), card)
    return { first: items[0].dueDate, last: items[items.length - 1].dueDate }
  }
  const plan = planInstallments(count, count, selectedDate)
  return { first: plan[0].dueDate, last: plan[plan.length - 1].dueDate }
}

function postedDate(date: string, card: CreditCard | null) {
  if (!card) return date
  return allocatePurchase(previewPurchase(date, 1, card.id), card)[0].dueDate
}

function previewRecurrence(frequency: Frequency, startDate: string, dueDay: number, endDate: string | null): Recurrence {
  return {
    id: 'preview',
    kind: 'expense',
    description: 'Prévia',
    categoryId: 'preview',
    amountCents: 1,
    startDate,
    frequency,
    dueDay,
    endDate,
    active: true,
    party: null,
    paymentMethod: null,
    notes: null,
    createdAt: '',
    updatedAt: '',
  }
}

function previewPurchase(purchaseDate: string, count: number, cardId: string) {
  return {
    id: 'preview',
    cardId,
    description: 'Prévia',
    categoryId: 'preview',
    party: null,
    purchaseDate,
    totalCents: count,
    installmentCount: count,
    notes: null,
    createdAt: '',
  }
}

function choice(type: 'income' | 'expense', active: boolean) {
  const base = 'h-12 rounded-xl border font-semibold'
  if (type === 'income') {
    return active ? `${base} border-primary bg-primary text-white` : `${base} border-primary bg-card text-income`
  }
  return active ? `${base} border-expense bg-expense text-white` : `${base} border-expense bg-card text-expense`
}
