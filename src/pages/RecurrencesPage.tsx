import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { normalizeCategoryName } from '@/domain/category-icons'
import { formatDateBR, todayISO } from '@/domain/dates'
import { allocatePurchase, invoiceId, projectInvoices } from '@/domain/invoices'
import { centsToInput, parseMoneyInput } from '@/domain/money'
import { activeSettledCents, pendingCents, statusFromAmounts, statusLabel } from '@/domain/settlement'
import type { CreditCard, CreditCardPurchase, EntryKind, Frequency, Recurrence, Settlement, Transaction } from '@/domain/types'
import type { FinanceSnapshot } from '@/db/finance-repository'
import * as finance from '@/db/finance-repository'
import { useFinance } from '@/state/FinanceContext'
import { frequencyLabels } from '@/lib/labels'
import { cn } from '@/lib/cn'
import { competenceLabel } from '@/components/finance/CompetenceSwitcher'
import { Money } from '@/components/finance/Money'
import { MoneyInput } from '@/components/finance/MoneyInput'
import { Button } from '@/components/ui/button'
import { SelectInput, TextInput } from '@/components/ui/field'
import { ConfirmDialog } from '@/components/ui/sheet'

type RuleAction = 'pause' | 'resume' | 'end' | 'delete'

interface GeneratedTitle {
  key: string
  date: string
  competence: string
  amountCents: number
  kind: EntryKind
  openId: string
  statusLabel: string
  open: boolean
  removed: boolean
}

function RecurrenceBadge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', className)}>{children}</span>
}

export function RecurrencesPage() {
  const { snapshot, mutate } = useFinance()
  const navigate = useNavigate()
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ id: string; action: RuleAction } | null>(null)
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | EntryKind>('all')

  if (!snapshot) return <p>Carregando recorrências...</p>

  const search = normalizeCategoryName(query)
  const visibleRecurrences = snapshot.recurrences.filter((recurrence) => {
    if (kindFilter !== 'all' && recurrence.kind !== kindFilter) return false
    if (!search) return true
    const cardName = snapshot.creditCards.find((card) => card.id === recurrence.cardId)?.name ?? ''
    return [recurrence.description, recurrence.party ?? '', cardName].some((value) => normalizeCategoryName(value).includes(search))
  })
  const viewing = snapshot.recurrences.find((item) => item.id === viewingId) ?? null
  const pendingRule = snapshot.recurrences.find((item) => item.id === pending?.id) ?? null
  const today = todayISO()

  function openTitle(title: GeneratedTitle) {
    const kind = title.openId.startsWith('invoice:') ? 'expense' : title.kind
    navigate(`/mes?c=${title.competence}&f=${kind}&open=${encodeURIComponent(title.openId)}`)
  }

  function runPending() {
    if (!pending) return
    const { id, action } = pending
    setPending(null)
    if (action === 'pause') void mutate(() => finance.setRecurrenceActive(id, false), 'Recorrência pausada.')
    if (action === 'resume') void mutate(() => finance.setRecurrenceActive(id, true), 'Recorrência retomada.')
    if (action === 'end') void mutate(() => finance.endRecurrence(id, today), 'Recorrência encerrada. Títulos pagos foram preservados.')
    if (action === 'delete') void mutate(() => finance.deleteRecurrence(id), 'Recorrência excluída.')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Recorrências</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Cada item é a regra que gera os títulos. Excluir um lançamento tira só aquele título. Para apagar a regra, use Excluir nesta tela.
        </p>
      </header>
      <div className="flex flex-col gap-2 sm:flex-row">
        <TextInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar recorrência"
          aria-label="Buscar recorrência"
        />
        <SelectInput value={kindFilter} onChange={(event) => setKindFilter(event.target.value as 'all' | EntryKind)} aria-label="Filtrar por tipo">
          <option value="all">Todos</option>
          <option value="income">Receitas</option>
          <option value="expense">Despesas</option>
        </SelectInput>
      </div>
      <ul className="space-y-3">
        {snapshot.recurrences.length === 0 ? <li className="text-sm text-muted-foreground">Nenhuma recorrência cadastrada.</li> : null}
        {snapshot.recurrences.length > 0 && visibleRecurrences.length === 0 ? (
          <li className="text-sm text-muted-foreground">Nenhuma recorrência encontrada.</li>
        ) : null}
        {visibleRecurrences.map((recurrence) => (
          <li key={recurrence.id} className="rounded-3xl border border-border bg-card p-4 shadow-sm">
            <button type="button" className="w-full rounded-2xl text-left hover:bg-secondary/50" onClick={() => setViewingId(recurrence.id)}>
              <p className="font-semibold">{recurrence.description}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <RecurrenceBadge className="bg-[#e7eef8] text-[#2c4c78]">{frequencyLabels[recurrence.frequency]}</RecurrenceBadge>
                <RecurrenceBadge className="bg-muted text-muted-foreground">dia {recurrence.dueDay}</RecurrenceBadge>
                <RecurrenceBadge className={recurrence.active ? 'bg-[#e5f4eb] text-income' : 'bg-[#f6f0e4] text-[#7a6240]'}>
                  {recurrence.active ? 'ativa' : 'pausada'}
                </RecurrenceBadge>
                {recurrence.cardId ? (
                  <RecurrenceBadge className="bg-secondary text-income">
                    {snapshot.creditCards.find((card) => card.id === recurrence.cardId)?.name ?? 'Cartão'}
                  </RecurrenceBadge>
                ) : null}
                {recurrence.endDate ? (
                  <RecurrenceBadge className="bg-[#f8e8e8] text-expense">até {formatDateBR(recurrence.endDate)}</RecurrenceBadge>
                ) : null}
              </div>
              <p className="mt-1">
                <Money cents={recurrence.amountCents} tone={recurrence.kind === 'income' ? 'income' : 'expense'} />
              </p>
            </button>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPending({ id: recurrence.id, action: recurrence.active ? 'pause' : 'resume' })}
              >
                {recurrence.active ? 'Pausar' : 'Retomar'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPending({ id: recurrence.id, action: 'end' })}>
                Encerrar hoje
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setPending({ id: recurrence.id, action: 'delete' })}>
                Excluir
              </Button>
              <RecurrenceAmountEditor
                amount={centsToInput(recurrence.amountCents)}
                frequency={recurrence.frequency}
                onSave={(amountCents, frequency) =>
                  void mutate(() =>
                    finance.updateRecurrenceRule(
                      recurrence.id,
                      { amountCents, frequency },
                      todayISO(),
                    ),
                  )
                }
              />
            </div>
          </li>
        ))}
      </ul>
      <GeneratedTitlesDialog
        recurrence={viewing}
        titles={viewing ? generatedTitles(viewing, snapshot, today, 'pause') : []}
        onOpenChange={(open) => {
          if (!open) setViewingId(null)
        }}
        onOpenTitle={openTitle}
      />
      <ConfirmDialog
        open={pendingRule !== null && pending !== null}
        title={pending ? actionTitle(pending.action) : ''}
        description={pending ? actionPreview(pending.action, today) : ''}
        confirmLabel={pending ? actionConfirm(pending.action) : 'Confirmar'}
        destructive={pending?.action === 'delete'}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        onConfirm={runPending}
      >
        {pendingRule && pending ? <OpenTitlePreview titles={generatedTitles(pendingRule, snapshot, today, pending.action)} /> : null}
      </ConfirmDialog>
    </div>
  )
}

function GeneratedTitlesDialog({
  recurrence,
  titles,
  onOpenChange,
  onOpenTitle,
}: {
  recurrence: Recurrence | null
  titles: GeneratedTitle[]
  onOpenChange: (open: boolean) => void
  onOpenTitle: (title: GeneratedTitle) => void
}) {
  return (
    <Dialog.Root open={recurrence !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#14211b]/40" />
        <Dialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto flex max-h-[85dvh] w-full max-w-lg -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-card shadow-xl">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <Dialog.Title className="text-lg font-semibold">{recurrence?.description}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                Títulos já gerados por esta regra. Escolha um para abrir no mês dele.
              </Dialog.Description>
            </div>
            <Dialog.Close className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-secondary" aria-label="Fechar">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {titles.length === 0 ? <li className="px-3 py-4 text-sm text-muted-foreground">Nenhum título gerado ainda.</li> : null}
            {titles.map((title) => (
              <li key={title.key}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-secondary"
                  onClick={() => onOpenTitle(title)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{formatDateBR(title.date)}</span>
                    <span className="block text-xs text-muted-foreground">{competenceLabel(title.competence)}</span>
                  </span>
                  <RecurrenceBadge className={title.open ? 'bg-[#f6f0e4] text-[#7a6240]' : 'bg-[#e5f4eb] text-income'}>
                    {title.statusLabel}
                  </RecurrenceBadge>
                  <Money cents={title.amountCents} tone={title.kind} />
                </button>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function OpenTitlePreview({ titles }: { titles: GeneratedTitle[] }) {
  const openTitles = titles.filter((title) => title.open)
  if (!openTitles.length) return <p className="text-sm text-muted-foreground">Não há títulos em aberto nesta regra.</p>
  return (
    <div>
      <p className="text-sm font-semibold">Títulos em aberto</p>
      <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
        {openTitles.map((title) => (
          <li key={title.key} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{formatDateBR(title.date)}</span>
              <span className="block text-xs text-muted-foreground">{competenceLabel(title.competence)}</span>
            </span>
            <RecurrenceBadge className={title.removed ? 'bg-[#f8e8e8] text-expense' : 'bg-[#e5f4eb] text-income'}>
              {title.removed ? 'Será apagado' : 'Permanece'}
            </RecurrenceBadge>
            <Money cents={title.amountCents} tone={title.kind} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function actionTitle(action: RuleAction) {
  if (action === 'pause') return 'Pausar recorrência'
  if (action === 'resume') return 'Retomar recorrência'
  if (action === 'end') return 'Encerrar recorrência'
  return 'Excluir recorrência'
}

function actionConfirm(action: RuleAction) {
  if (action === 'pause') return 'Pausar'
  if (action === 'resume') return 'Retomar'
  if (action === 'end') return 'Encerrar hoje'
  return 'Excluir'
}

function actionPreview(action: RuleAction, today: string) {
  if (action === 'pause') return 'A regra deixa de gerar títulos novos. Nenhum título já criado será apagado.'
  if (action === 'resume') return 'A regra volta a gerar os meses que ainda não existem. Nenhum título já criado será apagado.'
  if (action === 'end') {
    return `A regra encerra em ${formatDateBR(today)}. Títulos com vencimento até hoje permanecem. Títulos em aberto depois de hoje, sem baixa, serão apagados.`
  }
  return 'A regra será apagada. Títulos em aberto sem baixa serão apagados. Títulos que já tiveram baixa permanecem, sem vínculo com a regra.'
}

function generatedTitles(recurrence: Recurrence, snapshot: FinanceSnapshot, today: string, action: RuleAction): GeneratedTitle[] {
  const transactions = snapshot.transactions
    .filter((item) => item.recurrenceId === recurrence.id)
    .map((item) => transactionTitle(item, snapshot.settlements, today, action))
  const purchases = snapshot.purchases
    .filter((item) => item.recurrenceId === recurrence.id)
    .map((item) => purchaseTitle(item, snapshot, today, action))
    .filter((item): item is GeneratedTitle => item !== null)
  return [...transactions, ...purchases].sort((a, b) => a.date.localeCompare(b.date))
}

function transactionTitle(transaction: Transaction, settlements: Settlement[], today: string, action: RuleAction): GeneratedTitle {
  const related = settlements.filter((item) => item.targetType === 'transaction' && item.targetId === transaction.id)
  const settled = activeSettledCents(related)
  const status = statusFromAmounts(transaction.amountCents, settled)
  const anySettlement = related.length > 0
  const removed =
    action === 'delete'
      ? settled <= 0
      : action === 'end' && transaction.dueDate > today && !transaction.detached && !anySettlement
  return {
    key: transaction.id,
    date: transaction.dueDate,
    competence: transaction.competence,
    amountCents: transaction.amountCents,
    kind: transaction.kind,
    openId: transaction.id,
    statusLabel: statusLabel(status, transaction.kind),
    open: pendingCents(transaction.amountCents, settled) > 0,
    removed,
  }
}

function purchaseTitle(
  purchase: CreditCardPurchase,
  snapshot: FinanceSnapshot,
  today: string,
  action: RuleAction,
): GeneratedTitle | null {
  const card = snapshot.creditCards.find((item) => item.id === purchase.cardId)
  if (!card) return null
  const allocation = allocatePurchase(purchase, card)[0]
  if (!allocation) return null
  const blocked = invoiceHasSettlement(purchase, card, snapshot.settlements)
  const openInvoiceId = invoiceId(card.id, allocation.competence)
  const invoice = projectInvoices(snapshot.purchases, snapshot.creditCards).find((item) => item.id === openInvoiceId)
  const invoiceSettled = activeSettledCents(
    snapshot.settlements.filter((item) => item.targetType === 'invoice' && item.targetId === openInvoiceId),
  )
  const removed = action === 'pause' || action === 'resume' ? false : !blocked && (action === 'delete' || purchase.purchaseDate > today)
  return {
    key: purchase.id,
    date: purchase.purchaseDate,
    competence: allocation.competence,
    amountCents: purchase.totalCents,
    kind: 'expense',
    openId: openInvoiceId,
    statusLabel: invoiceSettled > 0 ? 'Fatura com baixa' : 'Em aberto',
    open: invoice ? pendingCents(invoice.amountCents, invoiceSettled) > 0 : !blocked,
    removed,
  }
}

function invoiceHasSettlement(purchase: CreditCardPurchase, card: CreditCard, settlements: Settlement[]) {
  return allocatePurchase(purchase, card).some((item) =>
    settlements.some((settlement) => settlement.targetType === 'invoice' && settlement.targetId === invoiceId(card.id, item.competence)),
  )
}

function RecurrenceAmountEditor({
  amount,
  frequency,
  onSave,
}: {
  amount: string
  frequency: Frequency
  onSave: (amountCents: number, frequency: Frequency) => void
}) {
  const [value, setValue] = useState(amount)
  const [nextFrequency, setNextFrequency] = useState(frequency)
  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row">
      <MoneyInput value={value} onChange={setValue} aria-label="Novo valor da recorrência" className="sm:max-w-48" />
      <SelectInput value={nextFrequency} onChange={(event) => setNextFrequency(event.target.value as Frequency)} aria-label="Frequência">
        {Object.entries(frequencyLabels).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </SelectInput>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          const cents = parseMoneyInput(value)
          if (cents) onSave(cents, nextFrequency)
        }}
      >
        Atualizar próximos
      </Button>
    </div>
  )
}
