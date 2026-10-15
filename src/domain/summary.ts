import { projectInvoices } from './invoices'
import { missingOccurrences } from './recurrence'
import { activeSettledCents, pendingCents } from './settlement'
import type {
  CreditCard,
  CreditCardPurchase,
  EntryKind,
  Recurrence,
  Settlement,
  Transaction,
} from './types'

export interface FlowItem {
  id: string
  kind: EntryKind
  competence: string
  dueDate: string
  amountCents: number
  settledCents: number
  cardSettledCents?: number
  categoryId: string
  source: 'transaction' | 'invoice'
  description: string
  party: string | null
}

export interface MonthTotals {
  incomePredicted: number
  incomeRealized: number
  expensePredicted: number
  expenseRealized: number
  projectedBalance: number
  realizedBalance: number
  pendingIncome: number
  pendingExpense: number
  pendingBalance: number
  availableAfterCommitments: number
  invoiceTotal: number
}

export function settlementsByTarget(settlements: Settlement[]): Map<string, Settlement[]> {
  const map = new Map<string, Settlement[]>()
  for (const settlement of settlements) {
    const key = `${settlement.targetType}:${settlement.targetId}`
    const list = map.get(key) ?? []
    list.push(settlement)
    map.set(key, list)
  }
  return map
}

export function settledFor(
  map: Map<string, Settlement[]>,
  targetType: Settlement['targetType'],
  targetId: string,
): number {
  return activeSettledCents(map.get(`${targetType}:${targetId}`) ?? [])
}

export function cardSettledFor(
  map: Map<string, Settlement[]>,
  targetType: Settlement['targetType'],
  targetId: string,
): number {
  return (map.get(`${targetType}:${targetId}`) ?? [])
    .filter((item) => item.status === 'active' && item.paymentMethod === 'cartao')
    .reduce((sum, item) => sum + item.amountCents, 0)
}

export function flowItems(input: {
  transactions: Transaction[]
  purchases: CreditCardPurchase[]
  cards: CreditCard[]
  settlements: Settlement[]
}): FlowItem[] {
  const settled = settlementsByTarget(input.settlements)
  const items: FlowItem[] = input.transactions.map((transaction) => ({
    id: transaction.id,
    kind: transaction.kind,
    competence: transaction.competence,
    dueDate: transaction.dueDate,
    amountCents: transaction.amountCents,
    settledCents: settledFor(settled, 'transaction', transaction.id),
    cardSettledCents: cardSettledFor(settled, 'transaction', transaction.id),
    categoryId: transaction.categoryId,
    source: 'transaction',
    description: transaction.description,
    party: transaction.party,
  }))

  for (const invoice of projectInvoices(input.purchases, input.cards)) {
    items.push({
      id: invoice.id,
      kind: 'expense',
      competence: invoice.competence,
      dueDate: invoice.dueDate,
      amountCents: invoice.amountCents,
      settledCents: settledFor(settled, 'invoice', invoice.id),
      cardSettledCents: cardSettledFor(settled, 'invoice', invoice.id),
      categoryId: 'cat-cartao',
      source: 'invoice',
      description: invoice.cardName,
      party: null,
    })
  }
  return items
}

export function isOpenItem(item: FlowItem) {
  return pendingCents(item.amountCents, item.settledCents) > 0
}

export function displayOrder(items: FlowItem[], positions: ReadonlyMap<string, number>): FlowItem[] {
  const compare = (a: FlowItem, b: FlowItem) => {
    const left = positions.get(a.id)
    const right = positions.get(b.id)
    if (left != null && right != null && left !== right) return left - right
    if (left != null) return -1
    if (right != null) return 1
    return a.dueDate.localeCompare(b.dueDate) || a.description.localeCompare(b.description, 'pt-BR')
  }
  const open = items.filter(isOpenItem).sort(compare)
  const settled = items.filter((item) => !isOpenItem(item)).sort(compare)
  return [...open, ...settled]
}

export function idsAfterStatusChange(items: FlowItem[], id: string, settled: boolean): string[] {
  const moving = items.find((item) => item.id === id)
  if (!moving) return items.map((item) => item.id)
  const rest = items.filter((item) => item.id !== id)
  const open = rest.filter(isOpenItem)
  const closed = rest.filter((item) => !isOpenItem(item))
  const next = settled ? [...open, ...closed, moving] : [...open, moving, ...closed]
  return next.map((item) => item.id)
}

export function totalsFor(items: FlowItem[], competence: string): MonthTotals {
  const month = items.filter((item) => item.competence === competence)
  const sum = (kind: EntryKind, pick: (item: FlowItem) => number) =>
    month.filter((item) => item.kind === kind).reduce((total, item) => total + pick(item), 0)

  const outsideCard = (item: FlowItem) => Math.max(0, item.amountCents - (item.cardSettledCents ?? 0))
  const cashSettled = (item: FlowItem) => Math.max(0, item.settledCents - (item.cardSettledCents ?? 0))
  const incomePredicted = sum('income', outsideCard)
  const expensePredicted = sum('expense', outsideCard)
  const incomeRealized = sum('income', cashSettled)
  const expenseRealized = sum('expense', cashSettled)
  const pendingIncome = sum('income', (item) => pendingCents(item.amountCents, item.settledCents))
  const pendingExpense = sum('expense', (item) => pendingCents(item.amountCents, item.settledCents))
  const invoiceTotal = month
    .filter((item) => item.source === 'invoice')
    .reduce((total, item) => total + item.amountCents, 0)

  return {
    incomePredicted,
    incomeRealized,
    expensePredicted,
    expenseRealized,
    projectedBalance: incomePredicted - expensePredicted,
    realizedBalance: incomeRealized - expenseRealized,
    pendingIncome,
    pendingExpense,
    pendingBalance: pendingIncome - pendingExpense,
    availableAfterCommitments: incomeRealized - expensePredicted,
    invoiceTotal,
  }
}

function cardSettledByTransaction(settlements: Settlement[]) {
  const totals = new Map<string, number>()
  for (const settlement of settlements) {
    if (settlement.status !== 'active' || settlement.paymentMethod !== 'cartao' || settlement.targetType !== 'transaction') continue
    totals.set(settlement.targetId, (totals.get(settlement.targetId) ?? 0) + settlement.amountCents)
  }
  return totals
}

export interface CategorySlice {
  categoryId: string
  amountCents: number
}

export function expenseSlices(input: {
  transactions: Transaction[]
  purchases: CreditCardPurchase[]
  cards: CreditCard[]
  settlements?: Settlement[]
  competence: string
}): CategorySlice[] {
  const totals = new Map<string, number>()
  const add = (categoryId: string, amount: number) => {
    totals.set(categoryId, (totals.get(categoryId) ?? 0) + amount)
  }

  const movedToCard = cardSettledByTransaction(input.settlements ?? [])
  for (const transaction of input.transactions) {
    if (transaction.kind === 'expense' && transaction.competence === input.competence) {
      add(transaction.categoryId, Math.max(0, transaction.amountCents - (movedToCard.get(transaction.id) ?? 0)))
    }
  }

  for (const invoice of projectInvoices(input.purchases, input.cards)) {
    if (invoice.competence !== input.competence) continue
    for (const item of invoice.items) add(item.categoryId, item.amountCents)
  }

  return [...totals.entries()]
    .map(([categoryId, amountCents]) => ({ categoryId, amountCents }))
    .filter((slice) => slice.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents)
}

export interface ForecastMonth {
  competence: string
  incomeCents: number
  expenseCents: number
  invoiceCents: number
  balanceCents: number
}

export interface ForecastResult {
  months: ForecastMonth[]
}

export function forecastMonths(input: {
  anchorCompetence: string
  count: number
  transactions: Transaction[]
  recurrences: Recurrence[]
  purchases: CreditCardPurchase[]
  cards: CreditCard[]
  settlements?: Settlement[]
}): ForecastResult {
  const competences: string[] = []
  let cursor = input.anchorCompetence
  for (let index = 0; index < input.count; index += 1) {
    competences.push(cursor)
    const [year, month] = cursor.split('-').map(Number)
    const next = new Date(year, month, 1)
    cursor = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
  }

  const existingKeys = new Map<string, Set<string>>()
  for (const transaction of input.transactions) {
    if (!transaction.recurrenceId || !transaction.occurrenceKey) continue
    const keys = existingKeys.get(transaction.recurrenceId) ?? new Set<string>()
    keys.add(transaction.occurrenceKey)
    existingKeys.set(transaction.recurrenceId, keys)
  }

  const income = new Map<string, number>()
  const expense = new Map<string, number>()
  const add = (map: Map<string, number>, competence: string, amount: number) => {
    if (!competences.includes(competence)) return
    map.set(competence, (map.get(competence) ?? 0) + amount)
  }

  const movedToCard = cardSettledByTransaction(input.settlements ?? [])
  for (const transaction of input.transactions) {
    const map = transaction.kind === 'income' ? income : expense
    const moved = transaction.kind === 'expense' ? movedToCard.get(transaction.id) ?? 0 : 0
    add(map, transaction.competence, Math.max(0, transaction.amountCents - moved))
  }

  const windowStart = `${competences[0]}-01`
  const last = competences[competences.length - 1]
  const [year, month] = last.split('-').map(Number)
  const windowEnd = `${last}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  for (const recurrence of input.recurrences) {
    if (recurrence.cardId && !input.cards.some((card) => card.id === recurrence.cardId)) continue
    const drafts = missingOccurrences(
      recurrence,
      existingKeys.get(recurrence.id) ?? [],
      [[windowStart, windowEnd]],
    )
    for (const draft of drafts) {
      const map = recurrence.kind === 'income' ? income : expense
      add(map, draft.competence, recurrence.amountCents)
    }
  }

  const invoice = new Map<string, number>()
  for (const projected of projectInvoices(input.purchases, input.cards)) {
    add(invoice, projected.competence, projected.amountCents)
    add(expense, projected.competence, projected.amountCents)
  }

  return {
    months: competences.map((competence) => {
      const incomeCents = income.get(competence) ?? 0
      const expenseCents = expense.get(competence) ?? 0
      return {
        competence,
        incomeCents,
        expenseCents,
        invoiceCents: invoice.get(competence) ?? 0,
        balanceCents: incomeCents - expenseCents,
      }
    }),
  }
}
