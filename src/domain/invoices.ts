import { addMonthsISO, competenceOf, dateISO, monthStart, splitDate } from './dates'
import { splitCents } from './installments'
import type { CreditCard, CreditCardPurchase, InvoiceItem, InvoiceView } from './types'

export function invoiceId(cardId: string, competence: string): string {
  return `invoice:${cardId}:${competence}`
}

export function parseInvoiceId(id: string): { cardId: string; competence: string } | null {
  const match = /^invoice:(.+):(\d{4}-\d{2})$/.exec(id)
  if (!match) return null
  return { cardId: match[1], competence: match[2] }
}

export interface InvoiceCycle {
  closingDate: string
  dueDate: string
  competence: string
}

export function dueDateForClosing(closingDate: string, closingDay: number, dueDay: number): string {
  const { year, month } = splitDate(closingDate)
  if (dueDay > closingDay) return dateISO(year, month, dueDay)
  const next = addMonthsISO(monthStart(competenceOf(closingDate)), 1)
  const target = splitDate(next)
  return dateISO(target.year, target.month, dueDay)
}

export function cycleForMonth(
  year: number,
  month: number,
  closingDay: number,
  dueDay: number,
): InvoiceCycle {
  const closingDate = dateISO(year, month, closingDay)
  const dueDate = dueDateForClosing(closingDate, closingDay, dueDay)
  return { closingDate, dueDate, competence: competenceOf(dueDate) }
}

export function cycleFromPurchaseDate(
  purchaseDate: string,
  closingDay: number,
  dueDay: number,
): InvoiceCycle {
  const { year, month, day } = splitDate(purchaseDate)
  const closingThisMonth = Number(dateISO(year, month, closingDay).slice(8, 10))
  let cycleYear = year
  let cycleMonth = month
  if (day > closingThisMonth) {
    const next = splitDate(addMonthsISO(monthStart(`${year}-${String(month).padStart(2, '0')}`), 1))
    cycleYear = next.year
    cycleMonth = next.month
  }
  return cycleForMonth(cycleYear, cycleMonth, closingDay, dueDay)
}

export function shiftCycle(cycle: InvoiceCycle, closingDay: number, dueDay: number, offset: number): InvoiceCycle {
  const shifted = splitDate(addMonthsISO(monthStart(competenceOf(cycle.closingDate)), offset))
  return cycleForMonth(shifted.year, shifted.month, closingDay, dueDay)
}

export interface AllocatedItem extends InvoiceItem {
  competence: string
  closingDate: string
  dueDate: string
}

export function allocationAmounts(purchase: Pick<CreditCardPurchase, 'totalCents' | 'installmentCount' | 'installmentAmountsCents'>): number[] {
  const custom = purchase.installmentAmountsCents
  if (custom && custom.length === purchase.installmentCount && custom.every((amount) => amount > 0)) return custom
  return splitCents(purchase.totalCents, purchase.installmentCount)
}

export function purchaseAmountPatch(
  purchase: Pick<CreditCardPurchase, 'totalCents' | 'installmentCount' | 'installmentAmountsCents'>,
  installmentNumber: number,
  amountCents: number,
): { totalCents: number; installmentAmountsCents?: number[] } {
  const current = allocationAmounts(purchase)
  const index = installmentNumber - 1
  const amounts = current.map((amount, position) => (position === index ? amountCents : amount))
  const totalCents = amounts.reduce((sum, amount) => sum + amount, 0)
  const even = splitCents(totalCents, purchase.installmentCount)
  const custom = amounts.some((amount, position) => amount !== even[position])
  return custom ? { totalCents, installmentAmountsCents: amounts } : { totalCents }
}

export function allocatePurchase(purchase: CreditCardPurchase, card: CreditCard): AllocatedItem[] {
  const amounts = allocationAmounts(purchase)
  const first = cycleFromPurchaseDate(purchase.purchaseDate, card.closingDay, card.dueDay)
  return amounts.map((amountCents, index) => {
    const cycle = index === 0 ? first : shiftCycle(first, card.closingDay, card.dueDay, index)
    return {
      purchaseId: purchase.id,
      description: purchase.description,
      categoryId: purchase.categoryId,
      party: purchase.party,
      purchaseDate: purchase.purchaseDate,
      installmentNumber: index + 1,
      installmentCount: purchase.installmentCount,
      amountCents,
      competence: cycle.competence,
      closingDate: cycle.closingDate,
      dueDate: cycle.dueDate,
    }
  })
}

export function projectInvoices(
  purchases: CreditCardPurchase[],
  cards: CreditCard[],
): InvoiceView[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]))
  const grouped = new Map<string, InvoiceView>()

  for (const purchase of purchases) {
    const card = cardsById.get(purchase.cardId)
    if (!card) continue
    const allocations = allocatePurchase(purchase, card)
    for (const item of allocations) {
      const id = invoiceId(card.id, item.competence)
      const current = grouped.get(id) ?? {
        id,
        cardId: card.id,
        cardName: card.name,
        competence: item.competence,
        closingDate: item.closingDate,
        dueDate: item.dueDate,
        items: [],
        amountCents: 0,
      }
      current.items.push(item)
      current.amountCents += item.amountCents
      grouped.set(id, current)
    }
  }

  return [...grouped.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.cardName.localeCompare(b.cardName))
}
