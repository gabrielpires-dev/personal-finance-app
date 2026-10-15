import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { authorize, login, normalizeState, refresh } from '../api/src/auth-core.js'

const filePath = join(process.cwd(), 'data', 'auth.json')
let queue = Promise.resolve()

async function readState() {
  try {
    return normalizeState(JSON.parse(await readFile(filePath, 'utf8')))
  } catch (error) {
    if (error && error.code === 'ENOENT') return normalizeState(null)
    throw error
  }
}

async function update(mutate) {
  let result
  const run = queue.then(async () => {
    result = mutate(await readState())
    await mkdir(dirname(filePath), { recursive: true })
    const temporary = `${filePath}.tmp`
    await writeFile(temporary, `${JSON.stringify(result.state)}\n`, 'utf8')
    await rename(temporary, filePath)
  })
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  await run
  return result
}

export async function authorizeHeader(authorization) {
  return authorize(await readState(), authorization)
}

export async function handleAuth(req, res) {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (req.method !== 'POST' || (url.pathname !== '/api/auth/login' && url.pathname !== '/api/auth/refresh')) {
      res.statusCode = 405
      res.end('Método não permitido.')
      return
    }
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    const result =
      url.pathname === '/api/auth/login'
        ? await update((state) => login(state, body.username, body.password))
        : await update((state) => refresh(state, body.refreshToken))
    res.statusCode = result.status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(result.body ?? { error: result.error }))
  } catch {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Não foi possível entrar.' }))
  }
}
