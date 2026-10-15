import { app } from '@azure/functions'
import { BlobServiceClient } from '@azure/storage-blob'
import { emptyDatabase, normalizeDatabase } from './normalize.js'

const containerName = 'finance'
const blobName = 'finance.json'

function financeBlob() {
  const connection = process.env.AzureWebJobsStorage
  if (!connection) throw new Error('O armazenamento do servidor não está configurado.')
  const container = BlobServiceClient.fromConnectionString(connection).getContainerClient(containerName)
  return { container, blob: container.getBlockBlobClient(blobName) }
}

async function readFinanceFile() {
  const { container, blob } = financeBlob()
  await container.createIfNotExists()
  if (!(await blob.exists())) return emptyDatabase()
  return normalizeDatabase(JSON.parse((await blob.downloadToBuffer()).toString('utf8')))
}

async function writeFinanceFile(value) {
  const next = normalizeDatabase(value)
  const { container, blob } = financeBlob()
  await container.createIfNotExists()
  const body = `${JSON.stringify(next, null, 2)}\n`
  await blob.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  })
}

app.http('finance', {
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  route: 'finance',
  handler: async (request) => {
    try {
      if (request.method === 'GET') return { jsonBody: await readFinanceFile() }
      if (request.method === 'PUT') {
        await writeFinanceFile(await request.json())
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
