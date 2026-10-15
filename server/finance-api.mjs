import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { emptyDatabase, normalizeDatabase } from '../api/src/functions/normalize.js'
import { authorizeHeader, handleAuth } from './auth-api.mjs'
import { handleDrive } from './drive-proxy.mjs'

const filePath = join(process.cwd(), 'data', 'finance.json')

export { normalizeDatabase }

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
    const gate = await authorizeHeader(req.headers.authorization)
    if (!gate.ok) {
      res.statusCode = 401
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'Sessão expirada. Entre novamente.' }))
      return
    }
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
    if (path === '/api/drive') {
      handleDrive(req, res).catch(next)
      return
    }
    if (path === '/api/auth/login' || path === '/api/auth/refresh') {
      handleAuth(req, res).catch(next)
      return
    }
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
