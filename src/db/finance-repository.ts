import config from '@/data/config.json'
import initialData from '@/data/initial-data.json'
import { resolveCategoryIcon } from '@/domain/category-icons'
import { resolveCardColor } from '@/domain/card-colors'
import { addDaysISO, monthStart, todayISO } from '@/domain/dates'
import { planInstallments, splitCents } from '@/domain/installments'
import { allocatePurchase, parseInvoiceId, projectInvoices, purchaseAmountPatch } from '@/domain/invoices'
import { missingOccurrences, generationRanges } from '@/domain/recurrence'
import { evaluateSettlement, reverseSettlement } from '@/domain/settlement'
import { institutionById } from '@/domain/institutions'
import { missingPartyDetails, type PartyDetailSource } from '@/domain/party-details'
import { buildBackup, parseBackup } from '@/domain/backup'
import { SCHEMA_VERSION } from '@/domain/types'
import type {
  AppSettings,
  BackupFile,
  Category,
  CreditCard,
  CreditCardPurchase,
  EntryKind,
  BankAccount,
  BankBalance,
  BankTransfer,
  InstallmentGroup,
  ListOrder,
  Party,
  PartyKind,
  PaymentMethod,
  Recurrence,
  Settlement,
  Transaction,
} from '@/domain/types'
import { databaseTables, db } from './database'

export class FinanceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FinanceError'
  }
}

export interface FinanceSnapshot {
  categories: Category[]
  transactions: Transaction[]
  settlements: Settlement[]
  recurrences: Recurrence[]
  creditCards: CreditCard[]
  purchases: CreditCardPurchase[]
  installmentGroups: InstallmentGroup[]
  parties: Party[]
  banks: BankAccount[]
  bankTransfers: BankTransfer[]
  bankBalances: BankBalance[]
  listOrders: ListOrder[]
  settings: AppSettings
}

function stamp() {
  return new Date().toISOString()
}

export function createId(): string {
  return crypto.randomUUID()
}

async function readSnapshot(): Promise<FinanceSnapshot> {
  const [categories, transactions, settlements, recurrences, creditCards, purchases, installmentGroups, parties, banks, bankTransfers, bankBalances, listOrders, settings] =
    await Promise.all([
      db.categories.toArray(),
      db.transactions.toArray(),
      db.settlements.toArray(),
      db.recurrences.toArray(),
      db.creditCards.toArray(),
      db.purchases.toArray(),
      db.installmentGroups.toArray(),
      db.parties.toArray(),
      db.banks.toArray(),
      db.bankTransfers.toArray(),
      db.bankBalances.toArray(),
      db.listOrders.toArray(),
      db.settings.get('app'),
    ])
  if (!settings) throw new FinanceError('As configurações locais não foram encontradas.')
  return { categories, transactions, settlements, recurrences, creditCards, purchases, installmentGroups, parties, banks, bankTransfers, bankBalances, listOrders, settings }
}

async function ensureSettings(competence: string) {
  const current = await db.settings.get('app')
  if (current) return current
  const created: AppSettings = {
    id: 'app',
    schemaVersion: SCHEMA_VERSION,
    lastBackupAt: null,
    lastCompetence: competence,
    createdAt: stamp(),
  }
  await db.settings.add(created)
  return created
}

async function ensureCategories() {
  const count = await db.categories.count()
  if (count > 0) return
  const transactions = await db.transactions.count()
  if (transactions > 0) return
  const categories: Category[] = initialData.categories.map((category) => ({
    id: category.id,
    name: category.name,
    kind: category.kind as EntryKind,
    icon: resolveCategoryIcon(category.icon, category.name),
    archived: false,
  }))
  await db.categories.bulkAdd(categories)
}

async function ensureCategoryIcons() {
  const categories = await db.categories.toArray()
  await Promise.all(
    categories
      .filter((category) => !category.icon)
      .map((category) => db.categories.update(category.id, { icon: resolveCategoryIcon(null, category.name) })),
  )
}

async function ensureRecurrences(selectedCompetence: string) {
  const recurrences = await db.recurrences.toArray()
  if (!recurrences.length) return
  const ranges = generationRanges(
    todayISO(),
    selectedCompetence,
    config.recurrenceHistoryMonths,
    config.recurrenceHorizonMonths,
  )
  const existing = await db.transactions.toArray()
  const purchases = await db.purchases.toArray()
  const cards = new Map((await db.creditCards.toArray()).map((card) => [card.id, card]))
  const createdAt = stamp()
  const drafts: Transaction[] = []
  const purchaseDrafts: CreditCardPurchase[] = []
  for (const recurrence of recurrences) {
    if (recurrence.kind === 'expense' && recurrence.cardId) {
      const card = cards.get(recurrence.cardId)
      if (!card || card.active === false) continue
      const keys = [
        ...purchases
          .filter((item) => item.recurrenceId === recurrence.id && item.occurrenceKey)
          .map((item) => item.occurrenceKey as string),
        ...(recurrence.skippedKeys ?? []),
      ]
      for (const occurrence of missingOccurrences(recurrence, keys, ranges)) {
        purchaseDrafts.push({
          id: createId(),
          cardId: recurrence.cardId,
          description: recurrence.description,
          categoryId: recurrence.categoryId,
          party: recurrence.party,
          purchaseDate: occurrence.dueDate,
          totalCents: recurrence.amountCents,
          installmentCount: 1,
          notes: recurrence.notes,
          bankId: recurrence.bankId ?? null,
          recurrenceId: recurrence.id,
          occurrenceKey: occurrence.occurrenceKey,
          demo: recurrence.demo,
          createdAt,
        })
      }
      continue
    }
    const keys = [
      ...existing
        .filter((item) => item.recurrenceId === recurrence.id && item.occurrenceKey)
        .map((item) => item.occurrenceKey as string),
      ...(recurrence.skippedKeys ?? []),
    ]
    for (const occurrence of missingOccurrences(recurrence, keys, ranges)) {
      drafts.push({
        id: createId(),
        kind: recurrence.kind,
        description: recurrence.description,
        categoryId: recurrence.categoryId,
        party: recurrence.party,
        entryDate: occurrence.dueDate,
        dueDate: occurrence.dueDate,
        competence: occurrence.competence,
        amountCents: recurrence.amountCents,
        paymentMethod: recurrence.paymentMethod,
        bankId: recurrence.bankId ?? null,
        cardId: recurrence.kind === 'income' ? recurrence.cardId ?? null : null,
        notes: recurrence.notes,
        recurrenceId: recurrence.id,
        occurrenceKey: occurrence.occurrenceKey,
        detached: false,
        installmentGroupId: null,
        installmentNumber: null,
        installmentCount: null,
        demo: recurrence.demo,
        createdAt,
        updatedAt: createdAt,
      })
    }
  }
  if (drafts.length) await db.transactions.bulkAdd(drafts)
  if (purchaseDrafts.length) await db.purchases.bulkAdd(purchaseDrafts)
}

export async function loadFinance(selectedCompetence: string): Promise<FinanceSnapshot> {
  await db.open()
  await ensureSettings(selectedCompetence)
  await ensureCategories()
  await ensureCategoryIcons()
  await ensureRecurrences(selectedCompetence)
  await ensureCardSettlementPurchases()
  return readSnapshot()
}

export async function saveListOrder(ids: string[]) {
  await db.transaction('rw', databaseTables, async () => {
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index]
      const current = await db.listOrders.get(id)
      if (current) await db.listOrders.update(id, { position: index })
      else await db.listOrders.add({ id, position: index })
    }
  })
}

export async function rememberCompetence(competence: string) {
  await db.settings.update('app', { lastCompetence: competence })
}

export async function setFavoriteCompetence(competence: string | null) {
  await db.settings.update('app', { favoriteCompetence: competence })
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed : null
}

export async function saveParty(input: {
  id?: string
  kind: PartyKind
  description: string
  entryDescription?: string | null
  categoryId?: string | null
  paymentMethod?: PaymentMethod | null
  bankId?: string | null
  cardId?: string | null
}) {
  const description = input.description.trim()
  if (description.length < 2) throw new FinanceError('Informe uma descrição com pelo menos 2 caracteres.')
  const entryDescription = clean(input.entryDescription)
  if (entryDescription && entryDescription.length < 2) {
    throw new FinanceError('A descrição da receita ou despesa precisa ter pelo menos 2 caracteres.')
  }
  const categoryId = input.categoryId || null
  if (categoryId) {
    const category = await db.categories.get(categoryId)
    const expected = input.kind === 'client' ? 'income' : 'expense'
    if (!category || category.kind !== expected) throw new FinanceError('Escolha uma categoria do mesmo tipo do contato.')
  }
  const paymentMethod = input.paymentMethod || null
  const bankId = input.bankId || null
  const cardId = paymentMethod === 'cartao' ? input.cardId || null : null
  if (cardId) {
    const card = await db.creditCards.get(cardId)
    if (!card || !card.active) throw new FinanceError('Escolha um cartão ativo.')
  }
  if (bankId) {
    const bank = await db.banks.get(bankId)
    if (!bank || bank.active === false) throw new FinanceError('Escolha um banco ativo.')
  }
  const parties = await db.parties.toArray()
  const duplicate = parties.find(
    (party) =>
      party.id !== input.id &&
      party.kind === input.kind &&
      party.description.localeCompare(description, 'pt-BR', { sensitivity: 'accent' }) === 0,
  )
  if (duplicate) throw new FinanceError('Já existe um cadastro com essa descrição.')
  const details = { description, kind: input.kind, entryDescription, categoryId, paymentMethod, bankId, cardId }
  if (input.id) {
    const current = await db.parties.get(input.id)
    if (!current) throw new FinanceError('Cadastro não encontrado.')
    await db.parties.update(input.id, details)
    return input.id
  }
  const id = createId()
  await db.parties.add({ id, ...details, createdAt: stamp() })
  return id
}

export async function deleteParty(id: string) {
  await db.parties.delete(id)
}

export async function saveBank(input: {
  id?: string
  institutionId: string
  agency: string
  account: string
  cardIds: string[]
  active: boolean
}) {
  if (!institutionById(input.institutionId)) throw new FinanceError('Escolha a instituição.')
  const agency = input.agency.trim()
  const account = input.account.trim()
  if (!agency || !account) throw new FinanceError('Informe a agência e a conta corrente.')
  const cardIds = [...new Set(input.cardIds)]
  const cards = await db.creditCards.toArray()
  if (cardIds.some((cardId) => !cards.some((card) => card.id === cardId))) {
    throw new FinanceError('Escolha apenas cartões cadastrados.')
  }
  const banks = await db.banks.toArray()
  const duplicate = banks.find(
    (bank) =>
      bank.id !== input.id &&
      bank.institutionId === input.institutionId &&
      bank.agency === agency &&
      bank.account === account,
  )
  if (duplicate) throw new FinanceError('Já existe essa conta nesta instituição.')
  const taken = banks.find((bank) => bank.id !== input.id && bank.cardIds.some((cardId) => cardIds.includes(cardId)))
  if (taken) throw new FinanceError('Um cartão selecionado já está vinculado a outro banco.')
  if (input.id) {
    const current = await db.banks.get(input.id)
    if (!current) throw new FinanceError('Banco não encontrado.')
    await db.banks.update(input.id, { institutionId: input.institutionId, agency, account, cardIds, active: input.active })
    return input.id
  }
  const id = createId()
  await db.banks.add({ id, institutionId: input.institutionId, agency, account, cardIds, active: input.active, createdAt: stamp() })
  return id
}

export async function deleteBank(id: string) {
  const current = await db.banks.get(id)
  if (!current) return
  const [parties, transactions, recurrences, purchases, groups, transfers, balances] = await Promise.all([
    db.parties.filter((item) => item.bankId === id).toArray(),
    db.transactions.filter((item) => item.bankId === id).toArray(),
    db.recurrences.filter((item) => item.bankId === id).toArray(),
    db.purchases.filter((item) => item.bankId === id).toArray(),
    db.installmentGroups.filter((item) => item.bankId === id).toArray(),
    db.bankTransfers.filter((item) => item.fromBankId === id || item.toBankId === id).toArray(),
    db.bankBalances.filter((item) => item.bankId === id).toArray(),
  ])
  await db.transaction('rw', databaseTables, async () => {
    for (const party of parties) await db.parties.update(party.id, { bankId: null })
    for (const transaction of transactions) await db.transactions.update(transaction.id, { bankId: null })
    for (const recurrence of recurrences) await db.recurrences.update(recurrence.id, { bankId: null })
    for (const purchase of purchases) await db.purchases.update(purchase.id, { bankId: null })
    for (const group of groups) await db.installmentGroups.update(group.id, { bankId: null })
    for (const transfer of transfers) await db.bankTransfers.delete(transfer.id)
    for (const balance of balances) await db.bankBalances.delete(balance.id)
    await db.banks.delete(id)
  })
}

export async function addBankTransfer(input: { competence: string; fromBankId: string; toBankId: string; amountCents: number }) {
  if (!/^\d{4}-\d{2}$/.test(input.competence)) throw new FinanceError('Informe o mês da transferência.')
  if (input.fromBankId === input.toBankId) throw new FinanceError('Escolha bancos diferentes.')
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new FinanceError('Informe um valor maior que zero.')
  const [from, to] = await Promise.all([db.banks.get(input.fromBankId), db.banks.get(input.toBankId)])
  if (!from || from.active === false || !to || to.active === false) throw new FinanceError('Escolha bancos ativos.')
  const transfer: BankTransfer = {
    id: createId(),
    competence: input.competence,
    fromBankId: input.fromBankId,
    toBankId: input.toBankId,
    amountCents: input.amountCents,
    createdAt: stamp(),
  }
  await db.bankTransfers.add(transfer)
  return transfer
}

export async function deleteBankTransfer(id: string) {
  await db.bankTransfers.delete(id)
}

export async function saveBankAdjustment(input: { bankId: string; competence: string; amountCents: number }) {
  if (!/^\d{4}-\d{2}$/.test(input.competence)) throw new FinanceError('Informe o mês do saldo.')
  if (!Number.isInteger(input.amountCents)) throw new FinanceError('Informe o saldo.')
  const bank = await db.banks.get(input.bankId)
  if (!bank) throw new FinanceError('Banco não encontrado.')
  const existing = (await db.bankBalances.filter((item) => item.bankId === input.bankId && item.competence === input.competence).toArray())[0]
  if (input.amountCents === 0) {
    if (existing) await db.bankBalances.delete(existing.id)
    return
  }
  if (existing) {
    await db.bankBalances.update(existing.id, { amountCents: input.amountCents })
    return
  }
  const row: BankBalance = { id: createId(), bankId: input.bankId, competence: input.competence, amountCents: input.amountCents }
  await db.bankBalances.add(row)
}

export async function saveCategory(input: { id?: string; name: string; kind: EntryKind; icon?: string }) {
  const name = input.name.trim()
  if (name.length < 2) throw new FinanceError('Informe um nome de categoria com pelo menos 2 caracteres.')
  const icon = resolveCategoryIcon(input.icon, name)
  const categories = await db.categories.toArray()
  const duplicate = categories.find(
    (category) =>
      category.id !== input.id &&
      category.kind === input.kind &&
      category.name.localeCompare(name, 'pt-BR', { sensitivity: 'accent' }) === 0,
  )
  if (duplicate) throw new FinanceError('Já existe uma categoria com esse nome.')
  if (input.id) {
    const current = await db.categories.get(input.id)
    if (!current) throw new FinanceError('Categoria não encontrada.')
    await db.categories.update(input.id, { name, kind: input.kind, icon })
    return input.id
  }
  const id = createId()
  await db.categories.add({ id, name, kind: input.kind, icon, archived: false })
  return id
}

export async function deleteCategory(id: string, replacementId?: string) {
  const category = await db.categories.get(id)
  if (!category) return
  const [transactions, recurrences, purchases, groups] = await Promise.all([
    db.transactions.filter((item) => item.categoryId === id).toArray(),
    db.recurrences.filter((item) => item.categoryId === id).toArray(),
    db.purchases.filter((item) => item.categoryId === id).toArray(),
    db.installmentGroups.filter((item) => item.categoryId === id).toArray(),
  ])
  const used = transactions.length + recurrences.length + purchases.length + groups.length > 0
  if (used && !replacementId) {
    throw new FinanceError('Essa categoria está em uso. Escolha outra para substituí-la antes de excluir.')
  }
  if (replacementId) {
    if (replacementId === id) throw new FinanceError('Escolha uma categoria diferente para a substituição.')
    const replacement = await db.categories.get(replacementId)
    if (!replacement || replacement.kind !== category.kind) {
      throw new FinanceError('A categoria substituta precisa ser do mesmo tipo.')
    }
  }
  await db.transaction('rw', databaseTables, async () => {
    if (replacementId) {
      await Promise.all([
        ...transactions.map((item) => db.transactions.update(item.id, { categoryId: replacementId })),
        ...recurrences.map((item) => db.recurrences.update(item.id, { categoryId: replacementId })),
        ...purchases.map((item) => db.purchases.update(item.id, { categoryId: replacementId })),
        ...groups.map((item) => db.installmentGroups.update(item.id, { categoryId: replacementId })),
      ])
    }
    await db.categories.delete(id)
  })
}

export interface TransactionInput {
  kind: EntryKind
  description: string
  categoryId: string
  party?: string | null
  entryDate: string
  dueDate: string
  amountCents: number
  paymentMethod?: PaymentMethod | null
  bankId?: string | null
  cardId?: string | null
  notes?: string | null
}

function transactionFromInput(input: TransactionInput, id = createId()): Transaction {
  const createdAt = stamp()
  return {
    id,
    kind: input.kind,
    description: input.description.trim(),
    categoryId: input.categoryId,
    party: clean(input.party),
    entryDate: input.entryDate,
    dueDate: input.dueDate,
    competence: input.dueDate.slice(0, 7),
    amountCents: input.amountCents,
    paymentMethod: input.paymentMethod ?? null,
    bankId: input.bankId || null,
    cardId: input.paymentMethod === 'cartao' ? input.cardId || null : null,
    notes: clean(input.notes),
    recurrenceId: null,
    occurrenceKey: null,
    detached: false,
    installmentGroupId: null,
    installmentNumber: null,
    installmentCount: null,
    createdAt,
    updatedAt: createdAt,
  }
}

async function rememberPartyDetails(kind: EntryKind, input: PartyDetailSource & { party?: string | null }) {
  const name = clean(input.party)
  if (!name) return
  const partyKind: PartyKind = kind === 'income' ? 'client' : 'establishment'
  const party = (await db.parties.toArray()).find(
    (item) => item.kind === partyKind && item.description.localeCompare(name, 'pt-BR', { sensitivity: 'accent' }) === 0,
  )
  if (!party) return
  const patch = missingPartyDetails(party, input)
  if (!Object.keys(patch).length) return
  await db.parties.update(party.id, patch)
}

export async function addTransaction(input: TransactionInput) {
  const record = transactionFromInput(input)
  await db.transactions.add(record)
  await rememberPartyDetails(record.kind, record)
  return record
}

export async function updateListedAmount(source: 'transaction' | 'invoice', id: string, amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new FinanceError('Informe um valor maior que zero.')
  if (source === 'transaction') {
    const current = await db.transactions.get(id)
    if (!current) throw new FinanceError('Lançamento não encontrado.')
    await db.transactions.update(id, { amountCents, updatedAt: stamp() })
    return
  }
  const snapshot = await readSnapshot()
  const invoice = projectInvoices(snapshot.purchases, snapshot.creditCards).find((item) => item.id === id)
  if (!invoice) throw new FinanceError('Fatura não encontrada.')
  if (invoice.items.length !== 1 || invoice.items[0].installmentCount !== 1) {
    throw new FinanceError('Esta fatura reúne mais de uma compra. Ajuste o valor em Detalhes.')
  }
  const purchase = await db.purchases.get(invoice.items[0].purchaseId)
  if (purchase?.settlementId) throw new FinanceError('Esta compra veio de uma baixa. Estorne a baixa para alterar o valor.')
  await db.purchases.update(invoice.items[0].purchaseId, { totalCents: amountCents })
}

export async function updatePurchaseAllocation(purchaseId: string, installmentNumber: number, amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new FinanceError('Informe um valor maior que zero.')
  const purchase = await db.purchases.get(purchaseId)
  if (!purchase) throw new FinanceError('Compra não encontrada.')
  if (purchase.settlementId) throw new FinanceError('Esta compra veio de uma baixa. Estorne a baixa para alterar o valor.')
  if (installmentNumber < 1 || installmentNumber > purchase.installmentCount) {
    throw new FinanceError('Parcela não encontrada.')
  }
  const patch = purchaseAmountPatch(purchase, installmentNumber, amountCents)
  await db.purchases.update(purchase.id, patch)
}

export async function setInvoiceAmount(invoiceId: string, amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new FinanceError('Informe um valor maior que zero.')
  if (!parseInvoiceId(invoiceId)) throw new FinanceError('Fatura não encontrada.')
  const snapshot = await readSnapshot()
  const invoice = projectInvoices(snapshot.purchases, snapshot.creditCards).find((item) => item.id === invoiceId)
  if (!invoice) throw new FinanceError('Fatura não encontrada.')
  if (amountCents < invoice.amountCents) {
    throw new FinanceError('O valor do cartão não pode ser menor que a soma dos lançamentos.')
  }
  const difference = amountCents - invoice.amountCents
  if (difference === 0) return
  const existing = invoice.items.find(
    (item) =>
      item.installmentCount === 1 &&
      !item.party &&
      item.description.localeCompare('Outros', 'pt-BR', { sensitivity: 'accent' }) === 0,
  )
  if (existing) {
    const purchase = await db.purchases.get(existing.purchaseId)
    if (purchase && purchase.installmentCount === 1) {
      await db.purchases.update(purchase.id, { totalCents: purchase.totalCents + difference })
      return
    }
  }
  const categories = await db.categories.toArray()
  const category =
    categories.find((item) => item.id === 'cat-despesa-outros' && item.kind === 'expense') ??
    categories.find((item) => item.kind === 'expense' && item.name.localeCompare('Outros', 'pt-BR', { sensitivity: 'accent' }) === 0)
  const categoryId = category?.id ?? invoice.items[0]?.categoryId
  if (!categoryId) throw new FinanceError('Não foi possível classificar o valor.')
  const bank = snapshot.banks.find((item) => item.cardIds.includes(invoice.cardId))
  await db.purchases.add({
    id: createId(),
    cardId: invoice.cardId,
    description: 'Outros',
    categoryId,
    party: null,
    bankId: bank?.id ?? null,
    purchaseDate: invoice.closingDate,
    totalCents: difference,
    installmentCount: 1,
    notes: null,
    createdAt: stamp(),
  })
}

export async function updateTransaction(id: string, input: TransactionInput) {
  const current = await db.transactions.get(id)
  if (!current) throw new FinanceError('Lançamento não encontrado.')
  await db.transactions.update(id, {
    kind: input.kind,
    description: input.description.trim(),
    categoryId: input.categoryId,
    party: clean(input.party),
    entryDate: input.entryDate,
    dueDate: input.dueDate,
    competence: input.dueDate.slice(0, 7),
    amountCents: input.amountCents,
    paymentMethod: input.paymentMethod ?? null,
    bankId: input.bankId || null,
    cardId: input.paymentMethod === 'cartao' ? input.cardId || null : null,
    notes: clean(input.notes),
    updatedAt: stamp(),
  })
}

export async function addRecurrence(input: Omit<Recurrence, 'id' | 'createdAt' | 'updatedAt' | 'demo'>) {
  const createdAt = stamp()
  const recurrence: Recurrence = { ...input, id: createId(), createdAt, updatedAt: createdAt }
  await db.recurrences.add(recurrence)
  await rememberPartyDetails(recurrence.kind, recurrence)
  return recurrence
}

export async function updateRecurrenceRule(
  id: string,
  patch: Partial<Omit<Recurrence, 'id' | 'createdAt' | 'demo'>>,
  fromDueDate?: string,
) {
  const current = await db.recurrences.get(id)
  if (!current) throw new FinanceError('Recorrência não encontrada.')
  const next = { ...current, ...patch, updatedAt: stamp() }
  await db.recurrences.update(id, next)
  if (!fromDueDate) return
  const transactions = await db.transactions.where('recurrenceId').equals(id).toArray()
  const settlements = await db.settlements.where('targetType').equals('transaction').toArray()
  for (const transaction of transactions) {
    if (transaction.detached || transaction.dueDate < fromDueDate) continue
    const settled = settlements
      .filter((item) => item.targetId === transaction.id && item.status === 'active')
      .reduce((sum, item) => sum + item.amountCents, 0)
    if (settled > 0) continue
    const dueDay = next.dueDay
    const [year, month] = transaction.competence.split('-').map(Number)
    const dueDate = next.frequency === 'monthly' || next.frequency === 'yearly'
      ? `${transaction.competence}-${String(Math.min(dueDay, new Date(year, month, 0).getDate())).padStart(2, '0')}`
      : transaction.dueDate
    await db.transactions.update(transaction.id, {
      description: next.description,
      categoryId: next.categoryId,
      amountCents: next.amountCents,
      party: next.party,
      paymentMethod: next.paymentMethod,
      bankId: next.bankId ?? null,
      cardId: next.kind === 'income' ? next.cardId ?? null : transaction.cardId ?? null,
      notes: next.notes,
      kind: next.kind,
      dueDate,
      competence: dueDate.slice(0, 7),
      updatedAt: stamp(),
    })
  }
  const purchases = await db.purchases.filter((item) => item.recurrenceId === id).toArray()
  for (const purchase of purchases) {
    if (purchase.purchaseDate < fromDueDate) continue
    if (await purchaseBlocked(purchase)) continue
    await db.purchases.update(purchase.id, {
      description: next.description,
      categoryId: next.categoryId,
      totalCents: next.amountCents,
      party: next.party,
      notes: next.notes,
      bankId: next.bankId ?? null,
    })
  }
}

export async function detachTransaction(id: string) {
  await db.transactions.update(id, { detached: true, updatedAt: stamp() })
}

export async function setRecurrenceActive(id: string, active: boolean) {
  await db.recurrences.update(id, { active, updatedAt: stamp() })
}

export async function endRecurrence(id: string, endDate: string) {
  const current = await db.recurrences.get(id)
  if (!current) throw new FinanceError('Recorrência não encontrada.')
  await db.recurrences.update(id, { endDate, active: true, updatedAt: stamp() })
  const transactions = await db.transactions.where('recurrenceId').equals(id).toArray()
  const settlements = await db.settlements.toArray()
  for (const transaction of transactions) {
    if (transaction.dueDate <= endDate || transaction.detached) continue
    const hasSettlement = settlements.some((item) => item.targetType === 'transaction' && item.targetId === transaction.id)
    if (hasSettlement) continue
    await db.transactions.delete(transaction.id)
  }
  const purchases = await db.purchases.filter((item) => item.recurrenceId === id).toArray()
  for (const purchase of purchases) {
    if (purchase.purchaseDate <= endDate) continue
    if (await purchaseBlocked(purchase)) continue
    await db.purchases.delete(purchase.id)
  }
}

export async function deleteRecurrence(id: string) {
  const current = await db.recurrences.get(id)
  if (!current) return
  const transactions = await db.transactions.where('recurrenceId').equals(id).toArray()
  const purchases = await db.purchases.filter((item) => item.recurrenceId === id).toArray()
  const settlements = await db.settlements.toArray()
  const now = stamp()
  await db.transaction('rw', databaseTables, async () => {
    for (const transaction of transactions) {
      const settled = settlements.some(
        (item) => item.targetType === 'transaction' && item.targetId === transaction.id && item.status === 'active',
      )
      if (settled) {
        await db.transactions.update(transaction.id, { recurrenceId: null, occurrenceKey: null, detached: true, updatedAt: now })
        continue
      }
      for (const settlement of settlements) {
        if (settlement.targetType === 'transaction' && settlement.targetId === transaction.id) {
          await db.settlements.delete(settlement.id)
        }
      }
      await db.transactions.delete(transaction.id)
    }
    for (const purchase of purchases) {
      if (await purchaseBlocked(purchase)) {
        await db.purchases.update(purchase.id, { recurrenceId: null, occurrenceKey: null })
        continue
      }
      await db.purchases.delete(purchase.id)
    }
    await db.recurrences.delete(id)
  })
}

export async function addInstallmentPlan(input: Omit<InstallmentGroup, 'id' | 'createdAt' | 'demo'>) {
  const createdAt = stamp()
  const group: InstallmentGroup = { ...input, id: createId(), createdAt }
  const plan = planInstallments(group.totalCents, group.count, group.firstDueDate)
  const transactions: Transaction[] = plan.map((installment) => ({
    id: createId(),
    kind: group.kind,
    description: `${group.description} ${installment.number}/${installment.count}`,
    categoryId: group.categoryId,
    party: group.party,
    entryDate: group.firstDueDate,
    dueDate: installment.dueDate,
    competence: installment.competence,
    amountCents: installment.amountCents,
    paymentMethod: group.paymentMethod,
    bankId: group.bankId ?? null,
    cardId: group.kind === 'income' ? group.cardId ?? null : null,
    notes: group.notes,
    recurrenceId: null,
    occurrenceKey: null,
    detached: false,
    installmentGroupId: group.id,
    installmentNumber: installment.number,
    installmentCount: installment.count,
    createdAt,
    updatedAt: createdAt,
  }))
  await db.transaction('rw', [db.installmentGroups, db.transactions, db.parties], async () => {
    await db.installmentGroups.add(group)
    await db.transactions.bulkAdd(transactions)
    await rememberPartyDetails(group.kind, group)
  })
  return group
}

export async function saveCard(input: Omit<CreditCard, 'id' | 'createdAt' | 'demo'> & { id?: string }) {
  if (input.closingDay < 1 || input.closingDay > 31 || input.dueDay < 1 || input.dueDay > 31) {
    throw new FinanceError('Informe dias de fechamento e vencimento entre 1 e 31.')
  }
  if (input.id) {
    const current = await db.creditCards.get(input.id)
    if (!current) throw new FinanceError('Cartão não encontrado.')
    await db.creditCards.update(input.id, {
      name: input.name.trim(),
      brand: clean(input.brand),
      color: resolveCardColor(input.color),
      limitCents: input.limitCents,
      closingDay: input.closingDay,
      dueDay: input.dueDay,
      active: input.active,
    })
    return
  }
  await db.creditCards.add({
    id: createId(),
    name: input.name.trim(),
    brand: clean(input.brand),
    color: resolveCardColor(input.color),
    limitCents: input.limitCents,
    closingDay: input.closingDay,
    dueDay: input.dueDay,
    active: input.active,
    createdAt: stamp(),
  })
}

export async function deleteCard(id: string) {
  const used = await db.purchases.filter((item) => item.cardId === id).count()
  if (used) throw new FinanceError('Este cartão possui compras. Desative-o para preservar o histórico.')
  const settlements = await db.settlements.filter((item) => item.targetId.startsWith(`invoice:${id}:`)).count()
  if (settlements) throw new FinanceError('Este cartão possui baixas de fatura e não pode ser excluído.')
  const [banks, parties, transactions, recurrences, groups, cardSettlements] = await Promise.all([
    db.banks.toArray(),
    db.parties.filter((item) => item.cardId === id).toArray(),
    db.transactions.filter((item) => item.cardId === id).toArray(),
    db.recurrences.filter((item) => item.kind === 'income' && item.cardId === id).toArray(),
    db.installmentGroups.filter((item) => item.cardId === id).toArray(),
    db.settlements.filter((item) => item.cardId === id).toArray(),
  ])
  await db.transaction('rw', databaseTables, async () => {
    await db.creditCards.delete(id)
    for (const party of parties) await db.parties.update(party.id, { cardId: null })
    for (const transaction of transactions) await db.transactions.update(transaction.id, { cardId: null })
    for (const recurrence of recurrences) await db.recurrences.update(recurrence.id, { cardId: null })
    for (const group of groups) await db.installmentGroups.update(group.id, { cardId: null })
    for (const settlement of cardSettlements) await db.settlements.update(settlement.id, { cardId: null })
    for (const bank of banks) {
      if (!bank.cardIds.includes(id)) continue
      await db.banks.update(bank.id, { cardIds: bank.cardIds.filter((cardId) => cardId !== id) })
    }
  })
}

export async function addPurchase(input: Omit<CreditCardPurchase, 'id' | 'createdAt' | 'demo'>) {
  const card = await db.creditCards.get(input.cardId)
  if (!card || !card.active) throw new FinanceError('Escolha um cartão ativo.')
  const purchase = { ...input, id: createId(), createdAt: stamp(), party: clean(input.party), notes: clean(input.notes) }
  await db.purchases.add(purchase)
  await rememberPartyDetails('expense', { ...purchase, paymentMethod: 'cartao' })
}

async function purchaseBlocked(purchase: CreditCardPurchase) {
  const card = await db.creditCards.get(purchase.cardId)
  if (!card) return true
  const allocations = allocatePurchase(purchase, card)
  const settlements = await db.settlements.filter((item) => item.targetType === 'invoice').toArray()
  return allocations.some((item) =>
    settlements.some((settlement) => settlement.status === 'active' && settlement.targetId === `invoice:${card.id}:${item.competence}`),
  )
}

export async function deletePurchase(id: string) {
  const purchase = await db.purchases.get(id)
  if (!purchase) return
  if (purchase.settlementId) throw new FinanceError('Esta compra veio de uma baixa. Estorne a baixa para removê-la.')
  if (await purchaseBlocked(purchase)) {
    throw new FinanceError('Estorne as baixas das faturas afetadas antes de excluir esta compra.')
  }
  const card = await db.creditCards.get(purchase.cardId)
  await db.purchases.delete(id)
  if (!card) return
  const remaining = (await db.purchases.toArray()).filter((item) => item.cardId === card.id)
  for (const allocation of allocatePurchase(purchase, card)) {
    const stillThere = remaining.some((item) => allocatePurchase(item, card).some((part) => part.competence === allocation.competence))
    if (stillThere) continue
    const rows = await db.settlements.filter((item) => item.targetId === `invoice:${card.id}:${allocation.competence}`).toArray()
    for (const row of rows) await db.settlements.delete(row.id)
  }
}

export async function deleteTransactionSeries(id: string, scope: 'one' | 'following') {
  const current = await db.transactions.get(id)
  if (!current) return
  const transactions = await db.transactions.toArray()
  const selected = transactions.filter((item) => sameSeries(current, item, scope))
  const selectedIds = new Set(selected.map((item) => item.id))
  const settlements = await db.settlements.toArray()
  if (settlements.some((item) => item.targetType === 'transaction' && item.status === 'active' && selectedIds.has(item.targetId))) {
    throw new FinanceError('Estorne as baixas deste título antes de excluir.')
  }
  if (current.recurrenceId) {
    const rule = await db.recurrences.get(current.recurrenceId)
    if (rule && scope === 'one' && current.occurrenceKey) {
      const skipped = new Set(rule.skippedKeys ?? [])
      skipped.add(current.occurrenceKey)
      await db.recurrences.update(rule.id, { skippedKeys: [...skipped], updatedAt: stamp() })
    }
    if (rule && scope === 'following') {
      const endDate = addDaysISO(current.dueDate, -1)
      const nextEnd = rule.endDate && rule.endDate < endDate ? rule.endDate : endDate
      await db.recurrences.update(rule.id, { endDate: nextEnd, updatedAt: stamp() })
    }
  }
  await db.transaction('rw', databaseTables, async () => {
    for (const settlement of settlements) {
      if (settlement.targetType === 'transaction' && selectedIds.has(settlement.targetId)) {
        await db.settlements.delete(settlement.id)
      }
    }
    for (const item of selected) await db.transactions.delete(item.id)
    if (current.installmentGroupId) {
      const remaining = transactions.some(
        (item) => item.installmentGroupId === current.installmentGroupId && !selectedIds.has(item.id),
      )
      if (!remaining) await db.installmentGroups.delete(current.installmentGroupId)
    }
  })
}

export async function deletePurchaseSeries(purchaseId: string, installmentNumber: number, scope: 'one' | 'following') {
  const purchase = await db.purchases.get(purchaseId)
  if (!purchase) return
  if (purchase.recurrenceId) {
    await deleteRecurringPurchase(purchase, scope)
    return
  }
  const card = await db.creditCards.get(purchase.cardId)
  if (!card) throw new FinanceError('Cartão não encontrado.')
  const seriesKey = purchase.seriesId ?? purchase.id
  const series = (await db.purchases.toArray()).filter((item) => item.id === seriesKey || item.seriesId === seriesKey)
  const cut = allocatePurchase(purchase, card).find((item) => item.installmentNumber === installmentNumber)
  if (!cut) throw new FinanceError('Parcela não encontrada.')
  for (const item of series) {
    const itemCard = await db.creditCards.get(item.cardId)
    if (!itemCard) continue
    const removed = allocatePurchase(item, itemCard).filter((allocation) =>
      scope === 'following' ? allocation.closingDate >= cut.closingDate : item.id === purchase.id && allocation.installmentNumber === installmentNumber,
    )
    if (await allocationsSettled(item.cardId, removed.map((allocation) => allocation.competence))) {
      throw new FinanceError('Estorne as baixas das faturas afetadas antes de excluir.')
    }
  }
  for (const item of series) {
    const itemCard = await db.creditCards.get(item.cardId)
    if (!itemCard) continue
    const allocations = allocatePurchase(item, itemCard)
    const kept = allocations.filter((allocation) =>
      scope === 'following'
        ? allocation.closingDate < cut.closingDate
        : !(item.id === purchase.id && allocation.installmentNumber === installmentNumber),
    )
    if (kept.length === allocations.length) continue
    await rewritePurchase(item, kept, seriesKey)
  }
}

async function deleteRecurringPurchase(purchase: CreditCardPurchase, scope: 'one' | 'following') {
  const purchases = await db.purchases.toArray()
  const selected = purchases.filter(
    (item) =>
      item.recurrenceId === purchase.recurrenceId &&
      (scope === 'one' ? item.id === purchase.id : item.purchaseDate >= purchase.purchaseDate),
  )
  for (const item of selected) {
    if (await purchaseBlocked(item)) throw new FinanceError('Estorne as baixas das faturas afetadas antes de excluir.')
  }
  const rule = purchase.recurrenceId ? await db.recurrences.get(purchase.recurrenceId) : undefined
  if (rule && scope === 'one' && purchase.occurrenceKey) {
    const skipped = new Set(rule.skippedKeys ?? [])
    skipped.add(purchase.occurrenceKey)
    await db.recurrences.update(rule.id, { skippedKeys: [...skipped], updatedAt: stamp() })
  }
  if (rule && scope === 'following') {
    const endDate = addDaysISO(purchase.purchaseDate, -1)
    const nextEnd = rule.endDate && rule.endDate < endDate ? rule.endDate : endDate
    await db.recurrences.update(rule.id, { endDate: nextEnd, updatedAt: stamp() })
  }
  for (const item of selected) await db.purchases.delete(item.id)
}

function sameSeries(current: Transaction, item: Transaction, scope: 'one' | 'following') {
  if (scope === 'one') return item.id === current.id
  if (current.installmentGroupId && item.installmentGroupId === current.installmentGroupId) {
    return (item.installmentNumber ?? 0) >= (current.installmentNumber ?? 0)
  }
  if (current.recurrenceId && item.recurrenceId === current.recurrenceId) return item.dueDate >= current.dueDate
  return item.id === current.id
}

async function allocationsSettled(cardId: string, competences: string[]) {
  if (!competences.length) return false
  const targets = new Set(competences.map((competence) => `invoice:${cardId}:${competence}`))
  const settlements = await db.settlements.filter((item) => item.targetType === 'invoice' && item.status === 'active').toArray()
  return settlements.some((item) => targets.has(item.targetId))
}

async function rewritePurchase(purchase: CreditCardPurchase, kept: ReturnType<typeof allocatePurchase>, seriesKey: string) {
  if (!kept.length) {
    await db.purchases.delete(purchase.id)
    return
  }
  const ordered = [...kept].sort((a, b) => a.installmentNumber - b.installmentNumber)
  const groups: Array<typeof ordered> = []
  let currentGroup: typeof ordered = []
  for (const item of ordered) {
    const previous = currentGroup[currentGroup.length - 1]
    if (previous && item.installmentNumber !== previous.installmentNumber + 1) {
      groups.push(currentGroup)
      currentGroup = []
    }
    currentGroup.push(item)
  }
  if (currentGroup.length) groups.push(currentGroup)
  const [first, ...rest] = groups
  await writePurchaseSlice(purchase.id, purchase, first, seriesKey)
  for (const group of rest) await writePurchaseSlice(null, purchase, group, seriesKey)
}

async function writePurchaseSlice(
  id: string | null,
  purchase: CreditCardPurchase,
  group: ReturnType<typeof allocatePurchase>,
  seriesKey: string,
) {
  const totalCents = group.reduce((sum, item) => sum + item.amountCents, 0)
  const repacked = splitCents(totalCents, group.length)
  const sameAmounts = repacked.every((amount, index) => amount === group[index].amountCents)
  const purchaseDate = group[0].installmentNumber === 1 ? purchase.purchaseDate : group[0].closingDate
  if (!sameAmounts) {
    if (id) await db.purchases.delete(id)
    for (const item of group) {
      await db.purchases.add({
        id: createId(),
        cardId: purchase.cardId,
        description: purchase.description,
        categoryId: purchase.categoryId,
        party: purchase.party,
        purchaseDate: item.closingDate,
        totalCents: item.amountCents,
        installmentCount: 1,
        notes: purchase.notes,
        seriesId: seriesKey,
        demo: purchase.demo,
        createdAt: stamp(),
      })
    }
    return
  }
  if (id) {
    await db.purchases.update(id, {
      purchaseDate,
      totalCents,
      installmentCount: group.length,
      seriesId: seriesKey,
    })
    return
  }
  await db.purchases.add({
    id: createId(),
    cardId: purchase.cardId,
    description: purchase.description,
    categoryId: purchase.categoryId,
    party: purchase.party,
    purchaseDate,
    totalCents,
    installmentCount: group.length,
    notes: purchase.notes,
    seriesId: seriesKey,
    demo: purchase.demo,
    createdAt: stamp(),
  })
}

async function purchaseLinkedToSettlement(settlementId: string) {
  const purchases = await db.purchases.toArray()
  return purchases.find((item) => item.settlementId === settlementId)
}

async function detachCardPurchase(settlementId: string) {
  const purchase = await purchaseLinkedToSettlement(settlementId)
  if (!purchase) return
  if (await purchaseBlocked(purchase)) {
    throw new FinanceError('Estorne a fatura do cartão antes de desfazer esta baixa.')
  }
  await db.purchases.delete(purchase.id)
}

async function attachCardPurchase(settlement: Settlement) {
  if (settlement.status !== 'active' || settlement.paymentMethod !== 'cartao' || !settlement.cardId) return
  const card = await db.creditCards.get(settlement.cardId)
  if (!card || card.active === false) return
  let description = 'Pagamento no cartão'
  let categoryId = 'cat-cartao'
  let party: string | null = null
  if (settlement.targetType === 'transaction') {
    const transaction = await db.transactions.get(settlement.targetId)
    if (!transaction || transaction.kind !== 'expense') return
    description = transaction.description
    categoryId = transaction.categoryId
    party = transaction.party
  } else {
    const parsed = parseInvoiceId(settlement.targetId)
    if (!parsed || parsed.cardId === settlement.cardId) return
    const invoiceCard = await db.creditCards.get(parsed.cardId)
    description = invoiceCard ? `Fatura ${invoiceCard.name}` : 'Fatura'
  }
  const existing = await purchaseLinkedToSettlement(settlement.id)
  const next = {
    cardId: settlement.cardId,
    description,
    categoryId,
    party,
    purchaseDate: settlement.date,
    totalCents: settlement.amountCents,
    installmentCount: 1,
    installmentAmountsCents: null,
    notes: settlement.note,
    bankId: settlement.bankId ?? null,
    settlementId: settlement.id,
  }
  if (existing) {
    if (existing.totalCents !== settlement.amountCents && (await purchaseBlocked(existing))) {
      throw new FinanceError('Estorne a fatura do cartão antes de alterar esta baixa.')
    }
    await db.purchases.update(existing.id, next)
    return
  }
  await db.purchases.add({
    ...next,
    id: createId(),
    demo: false,
    createdAt: stamp(),
  })
}

async function ensureCardSettlementPurchases() {
  const [settlements, purchases] = await Promise.all([db.settlements.toArray(), db.purchases.toArray()])
  const linked = new Set(purchases.map((item) => item.settlementId).filter((id): id is string => Boolean(id)))
  const missing = settlements.filter(
    (item) => item.status === 'active' && item.paymentMethod === 'cartao' && item.cardId && !linked.has(item.id),
  )
  if (!missing.length) return
  await db.transaction('rw', databaseTables, async () => {
    for (const settlement of missing) await attachCardPurchase(settlement)
  })
}

export async function addSettlement(input: {
  targetType: Settlement['targetType']
  targetId: string
  amountCents: number
  date: string
  note?: string | null
  paymentMethod?: PaymentMethod | null
  bankId?: string | null
  cardId?: string | null
  allowExcess: boolean
}) {
  let pending = 0
  if (input.targetType === 'transaction') {
    const transaction = await db.transactions.get(input.targetId)
    if (!transaction) throw new FinanceError('Lançamento não encontrado.')
    const current = await db.settlements.where('targetId').equals(input.targetId).toArray()
    const settled = current.filter((item) => item.status === 'active').reduce((sum, item) => sum + item.amountCents, 0)
    pending = Math.max(0, transaction.amountCents - settled)
  } else {
    const snapshot = await readSnapshot()
    const invoice = projectInvoices(snapshot.purchases, snapshot.creditCards).find((item) => item.id === input.targetId)
    if (!invoice) throw new FinanceError('Fatura não encontrada para esta competência.')
    const current = await db.settlements.where('targetId').equals(input.targetId).toArray()
    const settled = current.filter((item) => item.status === 'active').reduce((sum, item) => sum + item.amountCents, 0)
    pending = Math.max(0, invoice.amountCents - settled)
  }
  const decision = evaluateSettlement(pending, input.amountCents, input.allowExcess)
  if (!decision.ok) throw new FinanceError(decision.message ?? 'Não foi possível registrar a baixa.')
  if (input.bankId) {
    const bank = await db.banks.get(input.bankId)
    if (!bank || bank.active === false) throw new FinanceError('Escolha um banco ativo.')
  }
  const paymentMethod = input.paymentMethod || null
  const cardId = paymentMethod === 'cartao' ? input.cardId || null : null
  if (paymentMethod === 'cartao') {
    const card = cardId ? await db.creditCards.get(cardId) : null
    if (!card || card.active === false) throw new FinanceError('Escolha o cartão da baixa.')
  }
  const settlement: Settlement = {
    id: createId(),
    targetType: input.targetType,
    targetId: input.targetId,
    amountCents: input.amountCents,
    date: input.date,
    note: clean(input.note),
    paymentMethod,
    bankId: input.bankId || null,
    cardId,
    status: 'active',
    reversedAt: null,
    createdAt: stamp(),
  }
  await db.transaction('rw', databaseTables, async () => {
    await db.settlements.add(settlement)
    await attachCardPurchase(settlement)
  })
}

export async function reverseSettlementById(id: string) {
  const current = await db.settlements.get(id)
  if (!current) throw new FinanceError('Baixa não encontrada.')
  const reversed = reverseSettlement(current, stamp())
  await db.transaction('rw', databaseTables, async () => {
    await db.settlements.put(reversed)
    await detachCardPurchase(current.id)
  })
}

export async function reverseSettlementAmount(targetType: Settlement['targetType'], targetId: string, amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new FinanceError('Informe um valor maior que zero.')
  const current = await db.settlements.where('targetId').equals(targetId).toArray()
  const active = current
    .filter((item) => item.targetType === targetType && item.status === 'active')
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const settled = active.reduce((sum, item) => sum + item.amountCents, 0)
  if (amountCents > settled) throw new FinanceError('O valor é maior que o total baixado.')
  let remaining = amountCents
  const now = stamp()
  await db.transaction('rw', databaseTables, async () => {
    for (const item of active) {
      if (remaining <= 0) break
      await db.settlements.put(reverseSettlement(item, now))
      await detachCardPurchase(item.id)
      if (item.amountCents > remaining) {
        const remainder: Settlement = {
          ...item,
          id: createId(),
          amountCents: item.amountCents - remaining,
          status: 'active',
          reversedAt: null,
          createdAt: now,
        }
        await db.settlements.add(remainder)
        await attachCardPurchase(remainder)
      }
      remaining -= Math.min(item.amountCents, remaining)
    }
  })
}

export async function exportBackup(): Promise<BackupFile> {
  const snapshot = await readSnapshot()
  const exportedAt = stamp()
  await db.settings.update('app', { lastBackupAt: exportedAt })
  return buildBackup({ ...snapshot, app: 'personal-finance', schemaVersion: SCHEMA_VERSION }, exportedAt)
}

export async function importBackup(raw: unknown) {
  const parsed = parseBackup(raw)
  if (!parsed.ok) {
    throw new FinanceError(parsed.errors.join(' '))
  }
  const data = parsed.data
  await db.transaction('rw', databaseTables, async () => {
    await Promise.all(databaseTables.map((table) => table.clear()))
    await db.categories.bulkAdd(data.categories)
    await db.transactions.bulkAdd(data.transactions)
    await db.settlements.bulkAdd(data.settlements)
    await db.recurrences.bulkAdd(data.recurrences)
    await db.creditCards.bulkAdd(data.creditCards)
    await db.purchases.bulkAdd(data.purchases)
    await db.installmentGroups.bulkAdd(data.installmentGroups)
    if (data.parties.length) await db.parties.bulkAdd(data.parties)
    if (data.banks.length) await db.banks.bulkAdd(data.banks)
    if (data.bankTransfers.length) await db.bankTransfers.bulkAdd(data.bankTransfers)
    if (data.bankBalances.length) await db.bankBalances.bulkAdd(data.bankBalances)
    if (data.listOrders.length) await db.listOrders.bulkAdd(data.listOrders)
    await db.settings.add(data.settings)
  })
}

export async function loadDemoData() {
  const snapshot = await readSnapshot()
  const realMovement =
    snapshot.transactions.some((item) => !item.demo) ||
    snapshot.purchases.some((item) => !item.demo) ||
    snapshot.recurrences.some((item) => !item.demo) ||
    snapshot.creditCards.some((item) => !item.demo)
  if (realMovement) {
    throw new FinanceError('Há dados seus na base. O exemplo só pode ser carregado com a base vazia, para não se misturar.')
  }
  if (snapshot.transactions.some((item) => item.demo)) {
    throw new FinanceError('Os dados de exemplo já estão carregados.')
  }
  const today = todayISO()
  const competence = today.slice(0, 7)
  const createdAt = stamp()
  const cardId = createId()
  const salaryId = createId()
  const rentId = createId()
  const fuelId = createId()
  const card: CreditCard = {
    id: cardId,
    name: '[Exemplo] Cartão',
    brand: 'Visa',
    color: 'violeta',
    limitCents: 300000,
    closingDay: 10,
    dueDay: 17,
    active: true,
    demo: true,
    createdAt,
  }
  const salary: Recurrence = {
    id: salaryId,
    kind: 'income',
    description: '[Exemplo] Salário',
    categoryId: 'cat-salario',
    amountCents: 500000,
    startDate: monthStart(competence),
    frequency: 'monthly',
    dueDay: 5,
    endDate: null,
    active: true,
    party: null,
    paymentMethod: 'transferencia',
    notes: 'Registro de demonstração. Não é um lançamento real.',
    demo: true,
    createdAt,
    updatedAt: createdAt,
  }
  const rent: Recurrence = {
    id: rentId,
    kind: 'expense',
    description: '[Exemplo] Aluguel',
    categoryId: 'cat-moradia',
    amountCents: 180000,
    startDate: monthStart(competence),
    frequency: 'monthly',
    dueDay: 10,
    endDate: null,
    active: true,
    party: null,
    paymentMethod: 'boleto',
    notes: 'Registro de demonstração. Não é um lançamento real.',
    demo: true,
    createdAt,
    updatedAt: createdAt,
  }
  const fuel: Transaction = {
    id: fuelId,
    kind: 'expense',
    description: '[Exemplo] Combustível',
    categoryId: 'cat-combustivel',
    party: 'Posto',
    entryDate: today,
    dueDate: `${competence}-20`,
    competence,
    amountCents: 100000,
    paymentMethod: 'pix',
    notes: 'Registro de demonstração. Não é um lançamento real.',
    recurrenceId: null,
    occurrenceKey: null,
    detached: false,
    installmentGroupId: null,
    installmentNumber: null,
    installmentCount: null,
    demo: true,
    createdAt,
    updatedAt: createdAt,
  }
  const settlement: Settlement = {
    id: createId(),
    targetType: 'transaction',
    targetId: fuelId,
    amountCents: 30000,
    date: today,
    note: '[Exemplo] Abastecimento parcial',
    status: 'active',
    reversedAt: null,
    demo: true,
    createdAt,
  }
  const purchase: CreditCardPurchase = {
    id: createId(),
    cardId,
    description: '[Exemplo] Mercado',
    categoryId: 'cat-alimentacao',
    party: 'Mercado',
    purchaseDate: monthStart(competence),
    totalCents: 45000,
    installmentCount: 3,
    notes: 'Registro de demonstração. Não é um lançamento real.',
    demo: true,
    createdAt,
  }
  await db.transaction('rw', databaseTables, async () => {
    await db.creditCards.add(card)
    await db.recurrences.bulkAdd([salary, rent])
    await db.transactions.add(fuel)
    await db.settlements.add(settlement)
    await db.purchases.add(purchase)
  })
  await ensureRecurrences(competence)
}

export async function clearDemoData() {
  const [transactions, cards] = await Promise.all([
    db.transactions.filter((item) => item.demo === true).toArray(),
    db.creditCards.filter((item) => item.demo === true).toArray(),
  ])
  const transactionIds = new Set(transactions.map((item) => item.id))
  const cardIds = new Set(cards.map((item) => item.id))
  await db.transaction('rw', databaseTables, async () => {
    await db.settlements
      .filter((item) => {
        if (item.demo) return true
        if (item.targetType === 'transaction' && transactionIds.has(item.targetId)) return true
        if (item.targetType === 'invoice') {
          const cardId = item.targetId.slice('invoice:'.length, item.targetId.lastIndexOf(':'))
          return cardIds.has(cardId)
        }
        return false
      })
      .delete()
    await db.transactions.filter((item) => item.demo === true).delete()
    await db.recurrences.filter((item) => item.demo === true).delete()
    await db.purchases.filter((item) => item.demo === true || cardIds.has(item.cardId)).delete()
    await db.creditCards.filter((item) => item.demo === true).delete()
    await db.installmentGroups.filter((item) => item.demo === true).delete()
  })
}

export async function clearAllData() {
  await db.transaction('rw', databaseTables, async () => {
    await Promise.all(databaseTables.map((table) => table.clear()))
  })
  await ensureSettings(todayISO().slice(0, 7))
  await ensureCategories()
}
