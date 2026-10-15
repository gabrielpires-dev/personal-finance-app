import { app } from '@azure/functions'
import { login, refresh } from '../auth-core.js'
import { readBlobJson, writeBlobJson } from './storage.js'

const authBlobName = 'auth.json'
let queue = Promise.resolve()

async function update(mutate) {
  let result
  const run = queue.then(async () => {
    result = mutate(await readBlobJson(authBlobName))
    await writeBlobJson(authBlobName, result.state)
  })
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  await run
  return result
}

function jsonResult(result) {
  return {
    status: result.status,
    jsonBody: result.body ?? { error: result.error },
  }
}

app.http('auth-login', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/login',
  handler: async (request) => {
    try {
      const body = await request.json()
      return jsonResult(await update((state) => login(state, body?.username, body?.password)))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível entrar.'
      return { status: 400, jsonBody: { error: message } }
    }
  },
})

app.http('auth-refresh', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/refresh',
  handler: async (request) => {
    try {
      const body = await request.json()
      return jsonResult(await update((state) => refresh(state, body?.refreshToken)))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível renovar a sessão.'
      return { status: 400, jsonBody: { error: message } }
    }
  },
})
