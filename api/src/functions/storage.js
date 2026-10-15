import { BlobServiceClient } from '@azure/storage-blob'

const containerName = 'finance'

function storageConnection() {
  const keys = ['FINANCE_STORAGE_CONNECTION_STRING', 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING']
  for (const key of keys) {
    const value = process.env[key]
    if (value && value.includes('AccountName=') && value.includes('AccountKey=')) return value
  }
  throw new Error('O armazenamento do servidor não está configurado.')
}

function blockBlob(name) {
  const container = BlobServiceClient.fromConnectionString(storageConnection()).getContainerClient(containerName)
  return { container, blob: container.getBlockBlobClient(name) }
}

export async function readBlobJson(name) {
  const { container, blob } = blockBlob(name)
  await container.createIfNotExists()
  if (!(await blob.exists())) return null
  return JSON.parse((await blob.downloadToBuffer()).toString('utf8'))
}

export async function writeBlobJson(name, value) {
  const { container, blob } = blockBlob(name)
  await container.createIfNotExists()
  const body = `${JSON.stringify(value)}\n`
  await blob.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  })
}
