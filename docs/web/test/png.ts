import { inflateSync } from 'node:zlib'

export function decodePng(buf: Buffer): { width: number; height: number; data: Uint8Array } {
  let p = 8, idat: Buffer[] = [], width = 0, height = 0, type = 0
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('ascii', p + 4, p + 8), body = buf.subarray(p + 8, p + 8 + len)
    if (kind === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); type = body[9]!; if (body[8] !== 8 || body[12] !== 0) throw new Error('test decoder: 8-bit, non-interlaced only') }
    if (kind === 'IDAT') idat.push(body)
    p += 12 + len
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0
  if (!bpp) throw new Error('test decoder: RGB or RGBA only')
  const raw = inflateSync(Buffer.concat(idat)), stride = width * bpp, out = new Uint8Array(width * height * 4)
  const prev = new Uint8Array(stride), cur = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]!
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]!, a = i >= bpp ? cur[i - bpp]! : 0, b = prev[i]!, c = i >= bpp ? prev[i - bpp]! : 0
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
      cur[i] = (x + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]!) & 255
    }
    for (let i = 0; i < width; i++) { out.set(cur.subarray(i * bpp, i * bpp + 3), (y * width + i) * 4); out[(y * width + i) * 4 + 3] = bpp === 4 ? cur[i * 4 + 3]! : 255 }
    prev.set(cur)
  }
  return { width, height, data: out }
}
