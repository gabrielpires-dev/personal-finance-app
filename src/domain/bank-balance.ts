import type { BankAccount, BankBalance, BankTransfer, Settlement, Transaction } from './types'

export interface BankMonthBalance {
  bankId: string
  cents: number
}

function invoiceRef(id: string) {
  const match = /^invoice:(.+):(\d{4}-\d{2})$/.exec(id)
  if (!match) return null
  return { cardId: match[1], competence: match[2] }
}

export function bankMonthBalances(input: {
  competence: string
  banks: BankAccount[]
  transactions: Transaction[]
  settlements: Settlement[]
  transfers: BankTransfer[]
  adjustments?: BankBalance[]
}): BankMonthBalance[] {
  const totals = new Map<string, number>()
  const ensure = (bankId: string) => {
    if (!totals.has(bankId)) totals.set(bankId, 0)
  }
  for (const bank of input.banks) {
    if (bank.active !== false) ensure(bank.id)
  }

  const transactions = new Map(input.transactions.map((item) => [item.id, item]))
  const bankByCard = new Map<string, string>()
  for (const bank of input.banks) {
    for (const cardId of bank.cardIds) bankByCard.set(cardId, bank.id)
  }

  for (const settlement of input.settlements) {
    if (settlement.status !== 'active' || settlement.paymentMethod === 'cartao') continue
    if (settlement.targetType === 'transaction') {
      const transaction = transactions.get(settlement.targetId)
      if (!transaction || transaction.competence !== input.competence) continue
      const bankId = settlement.bankId || transaction.bankId
      if (!bankId) continue
      const sign = transaction.kind === 'income' ? 1 : -1
      ensure(bankId)
      totals.set(bankId, (totals.get(bankId) ?? 0) + sign * settlement.amountCents)
      continue
    }
    const invoice = invoiceRef(settlement.targetId)
    if (!invoice || invoice.competence !== input.competence) continue
    const bankId = settlement.bankId || bankByCard.get(invoice.cardId)
    if (!bankId) continue
    ensure(bankId)
    totals.set(bankId, (totals.get(bankId) ?? 0) - settlement.amountCents)
  }

  for (const transfer of input.transfers) {
    if (transfer.competence !== input.competence) continue
    ensure(transfer.fromBankId)
    ensure(transfer.toBankId)
    totals.set(transfer.fromBankId, (totals.get(transfer.fromBankId) ?? 0) - transfer.amountCents)
    totals.set(transfer.toBankId, (totals.get(transfer.toBankId) ?? 0) + transfer.amountCents)
  }

  for (const adjustment of input.adjustments ?? []) {
    if (adjustment.competence !== input.competence) continue
    ensure(adjustment.bankId)
    totals.set(adjustment.bankId, (totals.get(adjustment.bankId) ?? 0) + adjustment.amountCents)
  }

  return [...totals.entries()].map(([bankId, cents]) => ({ bankId, cents }))
}
