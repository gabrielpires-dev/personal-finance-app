import Dexie from 'dexie'

export interface MemoryTable<T extends { id: string }> {
  toArray(): Promise<T[]>
  get(id: string): Promise<T | undefined>
  add(row: T): Promise<void>
  bulkAdd(rows: T[]): Promise<void>
  update(id: string, patch: Partial<T>): Promise<void>
  put(row: T): Promise<void>
  delete(id: string): Promise<void>
  count(): Promise<number>
  clear(): Promise<void>
  filter(predicate: (item: T) => boolean): MemoryQuery<T>
  where<K extends keyof T>(field: K): { equals(value: T[K]): MemoryQuery<T> }
}

export interface MemoryQuery<T> {
  toArray(): Promise<T[]>
  count(): Promise<number>
  delete(): Promise<void>
}

interface DatabaseFile {
  categories: unknown[]
  transactions: unknown[]
  settlements: unknown[]
  recurrences: unknown[]
  creditCards: unknown[]
  purchases: unknown[]
  installmentGroups: unknown[]
  parties: unknown[]
  banks: unknown[]
  bankTransfers: unknown[]
  bankBalances: unknown[]
  listOrders: unknown[]
  settings: unknown
}

function copy<T>(row: T): T {
  return { ...row }
}

class Table<T extends { id: string }> implements MemoryTable<T> {
  rows: T[] = []

  constructor(private readonly touch: () => Promise<void>) {}

  async toArray() {
    return this.rows.map(copy)
  }

  async get(id: string) {
    const row = this.rows.find((item) => item.id === id)
    return row ? copy(row) : undefined
  }

  async add(row: T) {
    this.rows.push(copy(row))
    await this.touch()
  }

  async bulkAdd(rows: T[]) {
    this.rows.push(...rows.map(copy))
    await this.touch()
  }

  async update(id: string, patch: Partial<T>) {
    const row = this.rows.find((item) => item.id === id)
    if (!row) return
    Object.assign(row, patch)
    await this.touch()
  }

  async put(row: T) {
    const index = this.rows.findIndex((item) => item.id === row.id)
    if (index === -1) this.rows.push(copy(row))
    else this.rows[index] = copy(row)
    await this.touch()
  }

  async delete(id: string) {
    this.rows = this.rows.filter((item) => item.id !== id)
    await this.touch()
  }

  async count() {
    return this.rows.length
  }

  async clear() {
    this.rows = []
    await this.touch()
  }

  filter(predicate: (item: T) => boolean): MemoryQuery<T> {
    return {
      toArray: async () => this.rows.filter(predicate).map(copy),
      count: async () => this.rows.filter(predicate).length,
      delete: async () => {
        this.rows = this.rows.filter((item) => !predicate(item))
        await this.touch()
      },
    }
  }

  where<K extends keyof T>(field: K) {
    return {
      equals: (value: T[K]) => this.filter((item) => item[field] === value),
    }
  }
}

function table<T extends { id: string }>(touch: () => Promise<void>) {
  return new Table<T>(touch)
}

class FinanceDatabase {
  txDepth = 0
  hydrating = false
  opened = false
  server = false

  categories = table<import('@/domain/types').Category>(() => this.touch())
  transactions = table<import('@/domain/types').Transaction>(() => this.touch())
  settlements = table<import('@/domain/types').Settlement>(() => this.touch())
  recurrences = table<import('@/domain/types').Recurrence>(() => this.touch())
  creditCards = table<import('@/domain/types').CreditCard>(() => this.touch())
  purchases = table<import('@/domain/types').CreditCardPurchase>(() => this.touch())
  installmentGroups = table<import('@/domain/types').InstallmentGroup>(() => this.touch())
  parties = table<import('@/domain/types').Party>(() => this.touch())
  banks = table<import('@/domain/types').BankAccount>(() => this.touch())
  bankTransfers = table<import('@/domain/types').BankTransfer>(() => this.touch())
  bankBalances = table<import('@/domain/types').BankBalance>(() => this.touch())
  listOrders = table<import('@/domain/types').ListOrder>(() => this.touch())
  settings = table<import('@/domain/types').AppSettings>(() => this.touch())

  private snapshot(): DatabaseFile {
    return {
      categories: this.categories.rows,
      transactions: this.transactions.rows,
      settlements: this.settlements.rows,
      recurrences: this.recurrences.rows,
      creditCards: this.creditCards.rows,
      purchases: this.purchases.rows,
      installmentGroups: this.installmentGroups.rows,
      parties: this.parties.rows,
      banks: this.banks.rows,
      bankTransfers: this.bankTransfers.rows,
      bankBalances: this.bankBalances.rows,
      listOrders: this.listOrders.rows,
      settings: this.settings.rows[0] ?? null,
    }
  }

  private restore(data: DatabaseFile) {
    this.categories.rows = data.categories as typeof this.categories.rows
    this.transactions.rows = data.transactions as typeof this.transactions.rows
    this.settlements.rows = data.settlements as typeof this.settlements.rows
    this.recurrences.rows = data.recurrences as typeof this.recurrences.rows
    this.creditCards.rows = data.creditCards as typeof this.creditCards.rows
    this.purchases.rows = data.purchases as typeof this.purchases.rows
    this.installmentGroups.rows = data.installmentGroups as typeof this.installmentGroups.rows
    this.parties.rows = data.parties as typeof this.parties.rows
    this.banks.rows = (data.banks ?? []) as typeof this.banks.rows
    this.bankTransfers.rows = (data.bankTransfers ?? []) as typeof this.bankTransfers.rows
    this.bankBalances.rows = (data.bankBalances ?? []) as typeof this.bankBalances.rows
    this.listOrders.rows = (data.listOrders ?? []) as typeof this.listOrders.rows
    this.settings.rows = data.settings ? [data.settings as (typeof this.settings.rows)[number]] : []
  }

  private async touch() {
    if (this.hydrating || this.txDepth > 0) return
    await this.save()
  }

  async save() {
    if (this.hydrating || this.txDepth > 0) return
    const snapshot = this.snapshot()
    if (!this.server) {
      await writeBrowserDatabase(snapshot)
      return
    }
    const response = await fetch('/api/finance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    })
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(detail || 'Não foi possível gravar o banco no servidor.')
    }
  }

  async open() {
    if (this.opened) return
    const remote = await readServerDatabase()
    this.server = remote.available
    let data = remote.available ? remote.data : await readBrowserDatabase()
    let migrated = false
    if (isEmptyDatabase(data)) {
      const legacy = await readLegacyDatabase()
      if (legacy) {
        data = legacy
        migrated = true
      }
    }
    this.hydrating = true
    this.restore(data)
    this.hydrating = false
    this.opened = true
    if (migrated) {
      await this.save()
      indexedDB.deleteDatabase('personal-finance')
    }
  }

  async transaction(_mode: string, _tables: unknown, action: () => Promise<void>) {
    this.txDepth += 1
    const backup = structuredClone(this.snapshot())
    try {
      await action()
    } catch (error) {
      this.restore(backup)
      throw error
    } finally {
      this.txDepth -= 1
    }
    if (this.txDepth === 0) await this.save()
  }
}

export const db = new FinanceDatabase()

export function storesOnServer() {
  return db.server
}

const browserStore = new Dexie('personal-finance-browser')
browserStore.version(1).stores({ snapshot: 'id' })

function emptyDatabaseFile(): DatabaseFile {
  return {
    categories: [],
    transactions: [],
    settlements: [],
    recurrences: [],
    creditCards: [],
    purchases: [],
    installmentGroups: [],
    parties: [],
    banks: [],
    bankTransfers: [],
    bankBalances: [],
    listOrders: [],
    settings: null,
  }
}

async function readServerDatabase(): Promise<{ available: true; data: DatabaseFile } | { available: false }> {
  let response: Response
  try {
    response = await fetch('/api/finance', { headers: { Accept: 'application/json' } })
  } catch {
    throw new Error('Não foi possível ler o banco no servidor.')
  }
  const type = response.headers.get('content-type') ?? ''
  if (response.status === 404 || type.includes('text/html')) return { available: false }
  if (!response.ok) throw new Error('Não foi possível ler o banco no servidor.')
  const text = await response.text()
  try {
    return { available: true, data: JSON.parse(text) as DatabaseFile }
  } catch {
    return { available: false }
  }
}

async function readBrowserDatabase(): Promise<DatabaseFile> {
  const row = await browserStore.table<{ id: string; data: DatabaseFile }>('snapshot').get('app')
  return row?.data ?? emptyDatabaseFile()
}

async function writeBrowserDatabase(data: DatabaseFile) {
  await browserStore.table<{ id: string; data: DatabaseFile }>('snapshot').put({ id: 'app', data })
}

function isEmptyDatabase(data: DatabaseFile) {
  return (
    data.categories.length === 0 &&
    data.transactions.length === 0 &&
    data.settlements.length === 0 &&
    data.recurrences.length === 0 &&
    data.creditCards.length === 0 &&
    data.purchases.length === 0 &&
    data.installmentGroups.length === 0 &&
    data.parties.length === 0 &&
    data.settings == null
  )
}

async function readLegacyDatabase(): Promise<DatabaseFile | null> {
  if (typeof indexedDB === 'undefined') return null
  const legacy = new Dexie('personal-finance')
  legacy.version(1).stores({
    categories: 'id, kind, name',
    transactions: 'id, competence, kind, dueDate, recurrenceId, occurrenceKey, installmentGroupId',
    settlements: 'id, targetType, targetId, status',
    recurrences: 'id, active',
    creditCards: 'id, active',
    purchases: 'id, cardId, purchaseDate',
    installmentGroups: 'id',
    settings: 'id',
  })
  legacy.version(2).stores({
    parties: 'id, kind',
  })
  await legacy.open()
  const parties = legacy.tables.some((table) => table.name === 'parties') ? await legacy.table('parties').toArray() : []
  const settings = await legacy.table('settings').toArray()
  const data: DatabaseFile = {
    categories: await legacy.table('categories').toArray(),
    transactions: await legacy.table('transactions').toArray(),
    settlements: await legacy.table('settlements').toArray(),
    recurrences: await legacy.table('recurrences').toArray(),
    creditCards: await legacy.table('creditCards').toArray(),
    purchases: await legacy.table('purchases').toArray(),
    installmentGroups: await legacy.table('installmentGroups').toArray(),
    parties,
    banks: [],
    bankTransfers: [],
    bankBalances: [],
    listOrders: [],
    settings: settings[0] ?? null,
  }
  legacy.close()
  return isEmptyDatabase(data) ? null : data
}

export const databaseTables = [
  db.categories,
  db.transactions,
  db.settlements,
  db.recurrences,
  db.creditCards,
  db.purchases,
  db.installmentGroups,
  db.parties,
  db.banks,
  db.bankTransfers,
  db.bankBalances,
  db.listOrders,
  db.settings,
]
