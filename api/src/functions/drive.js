import { app } from '@azure/functions'
import { driveUrl } from '../drive-url.js'

app.http('drive', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'drive',
  handler: async (request) => {
    try {
      const response = await fetch(driveUrl, {
        method: 'POST',
        body: await request.text(),
        redirect: 'follow',
      })
      const text = await response.text()
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: text,
      }
    } catch {
      return { status: 502, jsonBody: { ok: false, error: 'Não foi possível falar com o Drive.' } }
    }
  },
})
