import fs from 'node:fs'
import zlib from 'node:zlib'

function crc32(buffer) {
  let crc = ~0
  for (const value of buffer) {
    crc ^= value
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return ~crc >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function createIcon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const center = size / 2
  const radius = size * 0.34
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x += 1) {
      const index = row + 1 + x * 4
      const dx = x - center + 0.5
      const dy = y - center + 0.5
      const inside = dx * dx + dy * dy <= radius * radius
      if (inside) {
        raw[index] = 255
        raw[index + 1] = 255
        raw[index + 2] = 255
        raw[index + 3] = 255
      } else {
        raw[index] = 0x1f
        raw[index + 1] = 0x8a
        raw[index + 2] = 0x4c
        raw[index + 3] = 255
      }
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

fs.mkdirSync('public', { recursive: true })
fs.writeFileSync('public/icon-192.png', createIcon(192))
fs.writeFileSync('public/icon-512.png', createIcon(512))
