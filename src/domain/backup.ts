import { z } from 'zod'
import { resolveCategoryIcon } from './category-icons'
import { institutionById } from './institutions'
import { SCHEMA_VERSION } from './types'
import type { BackupFile } from './types'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const competence = z.string().regex(/^\d{4}-\d{2}$/)
const cents = z.number().int()
const day = z.number().int().min(1).max(31)

const partySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['client', 'establishment']),
  description: z.string().min(1),
  entryDescription: z.string().nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  paymentMethod: z.enum(['pix', 'dinheiro', 'debito', 'transferencia', 'boleto', 'cartao', 'outro']).nullable().optional(),
  bankId: z.string().min(1).nullable().optional(),
  cardId: z.string().min(1).nullable().optional(),
  createdAt: z.string().min(1),
}).strict()

const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['income', 'expense']),
  archived: z.boolean(),
  icon: z.string().optional(),
  demo: z.boolean().optional(),
}).strict()

const transactionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['income', 'expense']),
  description: z.string().min(1),
  categoryId: z.string().min(1),
  party: z.string().nullable(),
  entryDate: isoDate,
  dueDate: isoDate,
  competence,
  amountCents: cents.positive(),
  paymentMethod: z.enum(['pix', 'dinheiro', 'debito', 'transferencia', 'boleto', 'cartao', 'outro']).nullable(),
  bankId: z.string().min(1).nullable().optional(),
  cardId: z.string().min(1).nullable().optional(),
  notes: z.string().nullable(),
  recurrenceId: z.string().nullable(),
  occurrenceKey: z.string().nullable(),
  detached: z.boolean(),
  installmentGroupId: z.string().nullable(),
  installmentNumber: z.number().int().positive().nullable(),
  installmentCount: z.number().int().positive().nullable(),
  demo: z.boolean().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict()

const settlementSchema = z.object({
  id: z.string().min(1),
  targetType: z.enum(['transaction', 'invoice']),
  targetId: z.string().min(1),
  amountCents: cents.positive(),
  date: isoDate,
  note: z.string().nullable(),
  paymentMethod: z.enum(['pix', 'dinheiro', 'debito', 'transferencia', 'boleto', 'cartao', 'outro']).nullable().optional(),
  bankId: z.string().min(1).nullable().optional(),
  cardId: z.string().min(1).nullable().optional(),
  status: z.enum(['active', 'reversed']),
  reversedAt: z.string().nullable(),
  demo: z.boolean().optional(),
  createdAt: z.string().min(1),
}).strict()

const recurrenceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['income', 'expense']),
  description: z.string().min(1),
  categoryId: z.string().min(1),
  amountCents: cents.positive(),
  startDate: isoDate,
  frequency: z.enum(['monthly', 'yearly', 'weekly', 'biweekly']),
  dueDay: day,
  endDate: isoDate.nullable(),
  active: z.boolean(),
  party: z.string().nullable(),
  paymentMethod: z.enum(['pix', 'dinheiro', 'debito', 'transferencia', 'boleto', 'cartao', 'outro']).nullable(),
  bankId: z.string().min(1).nullable().optional(),
  cardId: z.string().min(1).nullable().optional(),
  skippedKeys: z.array(z.string()).optional(),
  notes: z.string().nullable(),
  demo: z.boolean().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict()

const cardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().nullable(),
  color: z.string().min(1).optional(),
  limitCents: cents.positive().nullable(),
  closingDay: day,
  dueDay: day,
  active: z.boolean(),
  demo: z.boolean().optional(),
  createdAt: z.string().min(1),
}).strict()

const purchaseSchema = z.object({
  id: z.string().min(1),
  cardId: z.string().min(1),
  description: z.string().min(1),
  categoryId: z.string().min(1),
  party: z.string().nullable(),
  purchaseDate: isoDate,
  totalCents: cents.positive(),
  installmentCount: z.number().int().min(1).max(60),
  installmentAmountsCents: z.array(cents.positive()).optional(),
  notes: z.string().nullable(),
  bankId: z.string().min(1).nullable().optional(),
  recurrenceId: z.string().min(1).nullable().optional(),
  occurrenceKey: z.string().nullable().optional(),
  seriesId: z.string().min(1).nullable().optional(),
  settlementId: z.string().min(1).nullable().optional(),
  demo: z.boolean().optional(),
  createdAt: z.string().min(1),
}).strict()

const groupSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['income', 'expense']),
  description: z.string().min(1),
  categoryId: z.string().min(1),
  totalCents: cents.positive(),
  count: z.number().int().min(2).max(60),
  firstDueDate: isoDate,
  party: z.string().nullable(),
  paymentMethod: z.enum(['pix', 'dinheiro', 'debito', 'transferencia', 'boleto', 'cartao', 'outro']).nullable(),
  bankId: z.string().min(1).nullable().optional(),
  cardId: z.string().min(1).nullable().optional(),
  notes: z.string().nullable(),
  demo: z.boolean().optional(),
  createdAt: z.string().min(1),
}).strict()

const bankSchema = z.object({
  id: z.string().min(1),
  institutionId: z.string().min(1),
  agency: z.string().min(1),
  account: z.string().min(1),
  cardIds: z.array(z.string().min(1)),
  active: z.boolean().optional().default(true),
  createdAt: z.string().min(1),
}).strict()

const settingsSchema = z.object({
  id: z.literal('app'),
  schemaVersion: z.number().int(),
  lastBackupAt: z.string().nullable(),
  lastCompetence: competence.nullable(),
  favoriteCompetence: competence.nullable().optional(),
  createdAt: z.string().min(1),
}).strict()

export const backupSchema = z.object({
  app: z.literal('personal-finance'),
  schemaVersion: z.number().int(),
  exportedAt: z.string().min(1),
  categories: z.array(categorySchema),
  transactions: z.array(transactionSchema),
  settlements: z.array(settlementSchema),
  recurrences: z.array(recurrenceSchema),
  creditCards: z.array(cardSchema),
  purchases: z.array(purchaseSchema),
  installmentGroups: z.array(groupSchema),
  parties: z.array(partySchema).optional().default([]),
  banks: z.array(bankSchema).optional().default([]),
  bankTransfers: z
    .array(
      z.object({
        id: z.string().min(1),
        competence: competence,
        fromBankId: z.string().min(1),
        toBankId: z.string().min(1),
        amountCents: cents.positive(),
        createdAt: z.string().min(1),
      }).strict(),
    )
    .optional()
    .default([]),
  bankBalances: z
    .array(
      z.object({
        id: z.string().min(1),
        bankId: z.string().min(1),
        competence: competence,
        amountCents: z.number().int(),
      }).strict(),
    )
    .optional()
    .default([]),
  listOrders: z
    .array(
      z.object({
        id: z.string().min(1),
        position: z.number().int(),
      }).strict(),
    )
    .optional()
    .default([]),
  settings: settingsSchema,
}).strict()

export type BackupInput = Omit<BackupFile, 'exportedAt' | 'listOrders' | 'banks' | 'bankTransfers' | 'bankBalances'> & {
  exportedAt?: string
  listOrders?: BackupFile['listOrders']
  banks?: BackupFile['banks']
  bankTransfers?: BackupFile['bankTransfers']
  bankBalances?: BackupFile['bankBalances']
}

export function buildBackup(data: BackupInput, exportedAt: string): BackupFile {
  return {
    app: 'personal-finance',
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    categories: data.categories,
    transactions: data.transactions,
    settlements: data.settlements,
    recurrences: data.recurrences,
    creditCards: data.creditCards,
    purchases: data.purchases,
    installmentGroups: data.installmentGroups,
    parties: data.parties ?? [],
    banks: data.banks ?? [],
    bankTransfers: data.bankTransfers ?? [],
    bankBalances: data.bankBalances ?? [],
    listOrders: data.listOrders ?? [],
    settings: { ...data.settings, schemaVersion: SCHEMA_VERSION },
  }
}

function uniqueIds(ids: string[], label: string, errors: string[]) {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) errors.push(`${label} possui identificador duplicado: ${id}.`)
    seen.add(id)
  }
}

export function parseBackup(raw: unknown): { ok: true; data: BackupFile } | { ok: false; errors: string[] } {
  const parsed = backupSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, 8).map((issue) => `${issue.path.join('.') || 'arquivo'}: ${issue.message}`),
    }
  }

  const data = parsed.data
  const errors: string[] = []
  if (data.schemaVersion !== SCHEMA_VERSION) {
    errors.push(
      `A versão do backup é ${data.schemaVersion} e este aplicativo lê a versão ${SCHEMA_VERSION}. A restauração foi cancelada e nenhum dado local foi alterado.`,
    )
  }
  if (data.settings.schemaVersion !== SCHEMA_VERSION) {
    errors.push('A versão das configurações do backup não é compatível.')
  }

  uniqueIds(data.categories.map((item) => item.id), 'Categorias', errors)
  uniqueIds(data.transactions.map((item) => item.id), 'Lançamentos', errors)
  uniqueIds(data.settlements.map((item) => item.id), 'Baixas', errors)
  uniqueIds(data.recurrences.map((item) => item.id), 'Recorrências', errors)
  uniqueIds(data.creditCards.map((item) => item.id), 'Cartões', errors)
  uniqueIds(data.purchases.map((item) => item.id), 'Compras', errors)
  uniqueIds(data.installmentGroups.map((item) => item.id), 'Parcelamentos', errors)
  uniqueIds(data.parties.map((item) => item.id), 'Contatos', errors)
  uniqueIds(data.banks.map((item) => item.id), 'Bancos', errors)
  uniqueIds(data.bankTransfers.map((item) => item.id), 'Transferências', errors)
  uniqueIds(data.bankBalances.map((item) => item.id), 'Saldos', errors)
  uniqueIds(data.listOrders.map((item) => item.id), 'Ordem da lista', errors)

  const categories = new Set(data.categories.map((item) => item.id))
  const transactions = new Set(data.transactions.map((item) => item.id))
  const recurrences = new Set(data.recurrences.map((item) => item.id))
  const cards = new Set(data.creditCards.map((item) => item.id))
  const bankIds = new Set(data.banks.map((item) => item.id))
  const linkedCards = new Set<string>()
  for (const bank of data.banks) {
    if (!institutionById(bank.institutionId)) errors.push('Há um banco com instituição desconhecida.')
    for (const cardId of bank.cardIds) {
      if (!cards.has(cardId)) errors.push('Há um banco vinculado a um cartão que não existe.')
      if (linkedCards.has(cardId)) errors.push('Um cartão está vinculado a mais de um banco.')
      linkedCards.add(cardId)
    }
  }
  const missingBank = (bankId: string | null | undefined, label: string) => {
    if (bankId && !bankIds.has(bankId)) errors.push(`${label} aponta para um banco que não existe.`)
  }
  for (const party of data.parties) {
    missingBank(party.bankId, `Contato "${party.description}"`)
    if (party.cardId && !cards.has(party.cardId)) errors.push(`Contato "${party.description}" aponta para um cartão que não existe.`)
  }
  for (const settlement of data.settlements) {
    missingBank(settlement.bankId, 'Baixa')
    if (settlement.cardId && !cards.has(settlement.cardId)) errors.push('Há uma baixa apontando para um cartão que não existe.')
  }
  for (const transaction of data.transactions) missingBank(transaction.bankId, `Lançamento "${transaction.description}"`)
  for (const recurrence of data.recurrences) missingBank(recurrence.bankId, `Recorrência "${recurrence.description}"`)
  for (const purchase of data.purchases) missingBank(purchase.bankId, `Compra "${purchase.description}"`)
  for (const group of data.installmentGroups) {
    missingBank(group.bankId, `Parcelamento "${group.description}"`)
    if (group.cardId && !cards.has(group.cardId)) errors.push(`Parcelamento "${group.description}" aponta para um cartão que não existe.`)
  }
  for (const transfer of data.bankTransfers) {
    if (transfer.fromBankId === transfer.toBankId) errors.push('Há uma transferência com a mesma conta na origem e no destino.')
    missingBank(transfer.fromBankId, 'Transferência')
    missingBank(transfer.toBankId, 'Transferência')
  }
  const balanceKeys = new Set<string>()
  for (const balance of data.bankBalances) {
    missingBank(balance.bankId, 'Saldo')
    const key = `${balance.bankId}:${balance.competence}`
    if (balanceKeys.has(key)) errors.push('Há mais de um saldo ajustado para o mesmo banco no mês.')
    balanceKeys.add(key)
  }
  const groups = new Set(data.installmentGroups.map((item) => item.id))

  for (const transaction of data.transactions) {
    if (!categories.has(transaction.categoryId)) {
      errors.push(`Lançamento "${transaction.description}" aponta para uma categoria inexistente.`)
    }
    if (transaction.recurrenceId && !recurrences.has(transaction.recurrenceId)) {
      errors.push(`Lançamento "${transaction.description}" aponta para uma recorrência inexistente.`)
    }
    if (transaction.installmentGroupId && !groups.has(transaction.installmentGroupId)) {
      errors.push(`Lançamento "${transaction.description}" aponta para um parcelamento inexistente.`)
    }
    if (transaction.competence !== transaction.dueDate.slice(0, 7)) {
      errors.push(`Lançamento "${transaction.description}" está com a competência diferente do vencimento.`)
    }
    if (transaction.cardId && !cards.has(transaction.cardId)) {
      errors.push(`Lançamento "${transaction.description}" aponta para um cartão que não existe.`)
    }
  }

  for (const party of data.parties) {
    if (party.categoryId && !categories.has(party.categoryId)) errors.push(`Contato "${party.description}" sem categoria.`)
  }
  for (const recurrence of data.recurrences) {
    if (!categories.has(recurrence.categoryId)) errors.push(`Recorrência "${recurrence.description}" sem categoria.`)
    if (recurrence.cardId && !cards.has(recurrence.cardId)) errors.push(`Recorrência "${recurrence.description}" sem cartão.`)
  }
  for (const purchase of data.purchases) {
    if (!cards.has(purchase.cardId)) errors.push(`Compra "${purchase.description}" sem cartão.`)
    if (!categories.has(purchase.categoryId)) errors.push(`Compra "${purchase.description}" sem categoria.`)
    if (purchase.recurrenceId && !recurrences.has(purchase.recurrenceId)) {
      errors.push(`Compra "${purchase.description}" aponta para uma recorrência inexistente.`)
    }
  }
  for (const group of data.installmentGroups) {
    if (!categories.has(group.categoryId)) errors.push(`Parcelamento "${group.description}" sem categoria.`)
  }
  for (const settlement of data.settlements) {
    if (settlement.targetType === 'transaction' && !transactions.has(settlement.targetId)) {
      errors.push('Há uma baixa ligada a um lançamento que não existe no backup.')
    }
    if (settlement.targetType === 'invoice' && !/^invoice:.+:\d{4}-\d{2}$/.test(settlement.targetId)) {
      errors.push('Há uma baixa de fatura com identificador inválido.')
    }
    if (settlement.targetType === 'invoice') {
      const cardId = settlement.targetId.slice('invoice:'.length, settlement.targetId.lastIndexOf(':'))
      if (!cards.has(cardId)) errors.push('Há uma baixa de fatura de um cartão que não existe no backup.')
    }
  }

  if (errors.length) return { ok: false, errors: errors.slice(0, 12) }
  return {
    ok: true,
    data: {
      ...data,
      categories: data.categories.map((category) => ({
        ...category,
        icon: resolveCategoryIcon(category.icon, category.name),
      })),
    },
  }
}
