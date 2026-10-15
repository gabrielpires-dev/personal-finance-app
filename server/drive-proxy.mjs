import { driveUrl } from '../api/src/drive-url.js'

export async function handleDrive(req, res) {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Método não permitido.')
      return
    }
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const response = await fetch(driveUrl, {
      method: 'POST',
      body: Buffer.concat(chunks),
      redirect: 'follow',
    })
    const text = await response.text()
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(text)
  } catch {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: false, error: 'Não foi possível falar com o Drive.' }))
  }
}
