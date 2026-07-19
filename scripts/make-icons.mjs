// Genera los iconos PNG de la PWA a partir de la misma geometría que
// icon.svg (luna creciente sobre fondo índigo), sin dependencias externas.
// Uso: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public')

const BG = [0x5b, 0x5b, 0xd6]
const FG = [0xff, 0xff, 0xff]

// Escena en coordenadas 0..512 (idéntica a icon.svg).
function scene(x, y, rounded) {
  if (rounded && !inRoundedRect(x, y, 112)) return null
  const inCircle = (cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r
  if (inCircle(266, 246, 154) && !inCircle(322, 205, 133)) return FG
  if (inCircle(140, 150, 16) || inCircle(120, 350, 10)) return FG
  return BG
}

function inRoundedRect(x, y, r) {
  if (x < 0 || y < 0 || x > 512 || y > 512) return false
  const cx = x < r ? r : x > 512 - r ? 512 - r : x
  const cy = y < r ? r : y > 512 - r ? 512 - r : y
  if (cx === x || cy === y) return true
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

/** Renderiza con sobremuestreo 3x3 para suavizar los bordes. */
function render(size, rounded) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  const scale = 512 / size
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0 // byte de filtro PNG
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const c = scene((px + (sx + 0.5) / 3) * scale, (py + (sy + 0.5) / 3) * scale, rounded)
          if (c) {
            r += c[0]
            g += c[1]
            b += c[2]
            a += 255
          }
        }
      }
      const off = py * (size * 4 + 1) + 1 + px * 4
      const n = a / 255 || 1
      raw[off] = r / n
      raw[off + 1] = g / n
      raw[off + 2] = b / n
      raw[off + 3] = a / 9
    }
  }
  return raw
}

// --- Codificación PNG mínima (IHDR + IDAT + IEND) --------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, rounded) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(render(size, rounded), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'icon-192.png'), png(192, false))
writeFileSync(join(OUT, 'icon-512.png'), png(512, false))
writeFileSync(join(OUT, 'apple-touch-icon.png'), png(180, false))
console.log('Iconos generados en', OUT)
