export const SCHEMA_VERSION = 1

export type EntryKind = 'income' | 'expense'
export type PartyKind = 'client' | 'establishment'
export type Frequency = 'monthly' | 'yearly' | 'weekly' | 'biweekly'
export type SettlementTarget = 'transaction' | 'invoice'
export type SettlementStatus = 'active' | 'reversed'
export type TitleStatus = 'pending' | 'partial' | 'settled' | 'overpaid'
export type PaymentMethod =
  | 'pix'
  | 'dinheiro'
  | 'debito'
  | 'transferencia'
  | 'boleto'
  | 'cartao'
  | 'outro'

export interface Party {
  id: string
  kind: PartyKind
  description: string
  entryDescription?: string | null
  categoryId?: string | null
  paymentMethod?: PaymentMethod | null
  bankId?: string | null
  cardId?: string | null
  createdAt: string
}

export interface Category {
  id: string
  name: string
  kind: EntryKind
  icon: string
  archived: boolean
  demo?: boolean
}

export interface Transaction {
  id: string
  kind: EntryKind
  description: string
  categoryId: string
  party: string | null
  entryDate: string
  dueDate: string
  competence: string
  amountCents: number
  paymentMethod: PaymentMethod | null
  bankId?: string | null
  cardId?: string | null
  notes: string | null
  recurrenceId: string | null
  occurrenceKey: string | null
  detached: boolean
  installmentGroupId: string | null
  installmentNumber: number | null
  installmentCount: number | null
  demo?: boolean
  createdAt: string
  updatedAt: string
}

export interface Settlement {
  id: string
  targetType: SettlementTarget
  targetId: string
  amountCents: number
  date: string
  note: string | null
  paymentMethod?: PaymentMethod | null
  bankId?: string | null
  cardId?: string | null
  status: SettlementStatus
  reversedAt: string | null
  demo?: boolean
  createdAt: string
}

export interface Recurrence {
  id: string
  kind: EntryKind
  description: string
  categoryId: string
  amountCents: number
  startDate: string
  frequency: Frequency
  dueDay: number
  endDate: string | null
  active: boolean
  party: string | null
  paymentMethod: PaymentMethod | null
  bankId?: string | null
  cardId?: string | null
  skippedKeys?: string[]
  notes: string | null
  demo?: boolean
  createdAt: string
  updatedAt: string
}

export interface CreditCard {
  id: string
  name: string
  brand: string | null
  color?: string
  limitCents: number | null
  closingDay: number
  dueDay: number
  active: boolean
  demo?: boolean
  createdAt: string
}

export interface CreditCardPurchase {
  id: string
  cardId: string
  description: string
  categoryId: string
  party: string | null
  purchaseDate: string
  totalCents: number
  installmentCount: number
  installmentAmountsCents?: number[] | null
  notes: string | null
  bankId?: string | null
  recurrenceId?: string | null
  occurrenceKey?: string | null
  seriesId?: string | null
  settlementId?: string | null
  demo?: boolean
  createdAt: string
}

export interface InstallmentGroup {
  id: string
  kind: EntryKind
  description: string
  categoryId: string
  totalCents: number
  count: number
  firstDueDate: string
  party: string | null
  paymentMethod: PaymentMethod | null
  bankId?: string | null
  cardId?: string | null
  notes: string | null
  demo?: boolean
  createdAt: string
}

export interface BankAccount {
  id: string
  institutionId: string
  agency: string
  account: string
  cardIds: string[]
  active?: boolean
  createdAt: string
}

export interface BankTransfer {
  id: string
  competence: string
  fromBankId: string
  toBankId: string
  amountCents: number
  createdAt: string
}

export interface BankBalance {
  id: string
  bankId: string
  competence: string
  amountCents: number
}

export interface ListOrder {
  id: string
  position: number
}

export interface AppSettings {
  id: 'app'
  schemaVersion: number
  lastBackupAt: string | null
  lastCompetence: string | null
  favoriteCompetence?: string | null
  createdAt: string
}

export interface InvoiceItem {
  purchaseId: string
  description: string
  categoryId: string
  party: string | null
  purchaseDate: string
  installmentNumber: number
  installmentCount: number
  amountCents: number
}

export interface InvoiceView {
  id: string
  cardId: string
  cardName: string
  competence: string
  closingDate: string
  dueDate: string
  items: InvoiceItem[]
  amountCents: number
}

export interface OccurrenceDraft {
  occurrenceKey: string
  dueDate: string
  competence: string
}

export interface BackupFile {
  app: 'personal-finance'
  schemaVersion: number
  exportedAt: string
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
