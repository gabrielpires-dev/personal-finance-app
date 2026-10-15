import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const filePath = join(process.cwd(), 'data', 'finance.json')

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

function emptyDatabase() {
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

let queue = Promise.resolve()

async function readDatabase() {
  try {
    return normalizeDatabase(JSON.parse(await readFile(filePath, 'utf8')))
  } catch (error) {
    if (error && error.code === 'ENOENT') return emptyDatabase()
    throw error
  }
}

async function writeDatabase(value) {
  const next = normalizeDatabase(value)
  const run = queue.then(async () => {
    await mkdir(dirname(filePath), { recursive: true })
    const temporary = `${filePath}.tmp`
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    await rename(temporary, filePath)
  })
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  await run
}

export async function handleFinance(req, res) {
  try {
    if (req.method === 'GET') {
      const data = await readDatabase()
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(data))
      return
    }
    if (req.method === 'PUT') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const data = normalizeDatabase(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      await writeDatabase(data)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end('{"ok":true}')
      return
    }
    res.statusCode = 405
    res.setHeader('Allow', 'GET, PUT')
    res.end('Método não permitido.')
  } catch (error) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(error instanceof Error ? error.message : 'Não foi possível gravar o banco.')
  }
}

export function financeApi() {
  const middleware = (req, res, next) => {
    const path = req.url?.split('?')[0]
    if (path !== '/api/finance') return next()
    handleFinance(req, res).catch(next)
  }
  return {
    name: 'finance-api',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
