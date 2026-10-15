const collections = [
  'categories',
  'transactions',
  'settlements',
  'recurrences',
  'creditCards',
  'purchases',
  'installmentGroups',
  'parties',
]

export function emptyDatabase() {
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

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeDatabase(value) {
  if (!isRecord(value)) throw new Error('O banco precisa ser um objeto JSON.')
  const next = emptyDatabase()
  for (const key of collections) {
    if (!Array.isArray(value[key])) throw new Error(`O campo ${key} precisa ser uma lista.`)
    next[key] = value[key]
  }
  if (value.settings != null && !isRecord(value.settings)) throw new Error('As configurações do banco são inválidas.')
  if (value.bankBalances == null) next.bankBalances = []
  else if (!Array.isArray(value.bankBalances)) throw new Error('O campo bankBalances precisa ser uma lista.')
  else next.bankBalances = value.bankBalances
  if (value.bankTransfers == null) next.bankTransfers = []
  else if (!Array.isArray(value.bankTransfers)) throw new Error('O campo bankTransfers precisa ser uma lista.')
  else next.bankTransfers = value.bankTransfers
  if (value.banks == null) next.banks = []
  else if (!Array.isArray(value.banks)) throw new Error('O campo banks precisa ser uma lista.')
  else next.banks = value.banks
  if (value.listOrders == null) next.listOrders = []
  else if (!Array.isArray(value.listOrders)) throw new Error('O campo listOrders precisa ser uma lista.')
  else next.listOrders = value.listOrders
  next.settings = value.settings ?? null
  return next
}
