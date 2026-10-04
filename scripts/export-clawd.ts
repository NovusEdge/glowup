// Writes every Clawd frame as SVG and PNG under docs/assets/clawd/, plus one
// sprite-sheet PNG per animation. Run: node scripts/export-clawd.ts [scale]
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { CLAWD_SHEET } from '../hooks/sprites/clawd.ts'

type Frame = { ms: number; px: string[] }
const OUT = new URL('../docs/assets/clawd/', import.meta.url).pathname
const scale = Number(process.argv[2] ?? 16)
const { w, h } = CLAWD_SHEET

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

function svg(px: string[], pal: Record<string, string>) {
  const rects = px.flatMap((row, y) => [...row].map((k, x) => (pal[k] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[k]}"/>` : ''))).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges">${rects}</svg>\n`
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

// RGBA PNG of frames laid side by side, each pixel scaled up.
function png(frames: string[][], pal: Record<string, string>) {
  const W = w * scale * frames.length, H = h * scale
  const raw = Buffer.alloc((W * 4 + 1) * H)
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0
    for (let x = 0; x < W; x++) {
      const f = frames[Math.floor(x / (w * scale))]!, k = f[Math.floor(y / scale)]![Math.floor((x % (w * scale)) / scale)]!
      const c = pal[k]
      if (c) raw.set([...rgb(c), 255], y * (W * 4 + 1) + 1 + x * 4)
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const sets: [string, Record<string, { frames: Frame[] }>][] = [['', CLAWD_SHEET.animations], ['transitions/', CLAWD_SHEET.transitions ?? {}]]
const variants: [string, Record<string, string>][] = [['', CLAWD_SHEET.palette], ['shiny/', { ...CLAWD_SHEET.palette, ...CLAWD_SHEET.shiny }]]

rmSync(OUT, { recursive: true, force: true })
let count = 0
for (const [vdir, pal] of variants) for (const [sdir, anims] of sets) for (const [name, anim] of Object.entries(anims)) {
  const dir = `${OUT}${vdir}${sdir}${name}/`
  mkdirSync(dir, { recursive: true })
  anim.frames.forEach((f, i) => {
    const n = String(i).padStart(2, '0')
    writeFileSync(`${dir}${n}.svg`, svg(f.px, pal))
    writeFileSync(`${dir}${n}.png`, png([f.px], pal))
    count++
  })
  writeFileSync(`${dir}sheet.png`, png(anim.frames.map(f => f.px), pal))
}
console.log(`wrote ${count} frames to ${OUT} at ${scale}x`)
