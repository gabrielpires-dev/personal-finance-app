import { app } from '@azure/functions'
import { authorize } from '../auth-core.js'
import { emptyDatabase, normalizeDatabase } from './normalize.js'
import { readBlobJson, writeBlobJson } from './storage.js'

const blobName = 'finance.json'
const authBlobName = 'auth.json'

async function requireSession(request) {
  const state = await readBlobJson(authBlobName)
  const gate = authorize(state, request.headers.get('authorization'))
  if (gate.ok) return null
  return { status: 401, jsonBody: { error: 'Sessão expirada. Entre novamente.' } }
}

app.http('finance', {
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  route: 'finance',
  handler: async (request) => {
    try {
      const denied = await requireSession(request)
      if (denied) return denied
      if (request.method === 'GET') {
        const stored = await readBlobJson(blobName)
        return { jsonBody: stored ? normalizeDatabase(stored) : emptyDatabase() }
      }
      if (request.method === 'PUT') {
        await writeBlobJson(blobName, normalizeDatabase(await request.json()))
        return { jsonBody: { ok: true } }
      }
      return { status: 405, headers: { Allow: 'GET, PUT' }, body: 'Método não permitido.' }
    } catch (error) {
      return {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: error instanceof Error ? error.message : 'Não foi possível gravar o banco.',
      }
    }
  },
})
