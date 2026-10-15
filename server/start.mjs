import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { handleFinance } from './finance-api.mjs'

const dist = join(process.cwd(), 'dist')
const port = Number(process.env.PORT || 8080)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
}

function fileFor(urlPath) {
  const decoded = decodeURIComponent(urlPath)
  const candidate = normalize(join(dist, decoded))
  if (!candidate.startsWith(dist)) return null
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  return join(dist, 'index.html')
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/api/finance') {
    handleFinance(req, res).catch(() => {
      res.statusCode = 500
      res.end('Falha ao acessar o banco.')
    })
    return
  }
  const file = fileFor(url.pathname)
  if (!file || !existsSync(file)) {
    res.statusCode = 404
    res.end('Arquivo não encontrado.')
    return
  }
  res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream')
  createReadStream(file).pipe(res)
}).listen(port, () => {
  console.log(`Servidor em http://127.0.0.1:${port} · banco em data${sep}finance.json`)
})
