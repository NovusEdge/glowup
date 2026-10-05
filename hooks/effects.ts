// The built-in answers to glowup.field, glowup.meter and glowup.divider, which a pack picks
// with motion.field, colors.meters and colors.dividers. A renderer plugin that answers first wins.
import type { Seg } from './layout.tsx'
import type { Colors } from './themes.ts'
import type { Divider, Window } from './renderers.ts'
import type { Field } from './packs.ts'
import { mix } from './color.ts'

// Consecutive cells of one colour become one segment, which keeps a frame's data small.
function runs(cells: Seg[]): Seg[] {
  const out: Seg[] = []
  for (const c of cells) {
    const last = out[out.length - 1]
    if (last && last.color === c.color && !!last.bold === !!c.bold) last.text += c.text
    else out.push({ ...c })
  }
  return out
}

// Bayer threshold matrices by side; a braille cell is 2 dots across and 4 down.
function bayer(side: number): number[][] {
  let m = [[0]]
  for (let n = 1; n < side; n *= 2) m = Array.from({ length: n * 2 }, (_, y) => Array.from({ length: n * 2 }, (_, x) => m[y % n]![x % n]! * 4 + [[0, 2], [3, 1]][Math.floor(y / n)]![Math.floor(x / n)]!))
  return m
}
const BAYER: Record<Field['dither'], number[][]> = { '2x2': bayer(2), '4x4': bayer(4), '8x8': bayer(8) }
const DOT = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]]

// Integer hash of a lattice point to [0, 1): several times cheaper than the usual sin() hash,
// and the field calls it 16 times a sample, every tick.
function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}
const ease = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
function noise3(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), u = ease(x - ix), v = ease(y - iy), w = ease(z - iz)
  const c = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz)
  return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v), lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w)
}
const fbm3 = (x: number, y: number, z: number) => noise3(x, y, z) * 0.6 + noise3(x * 2.03, y * 2.03, z * 1.7) * 0.4

// The field's tick, the pet's: fast enough to read as motion, cheap enough to draw every time.
export const FIELD_TICK_MS = 83
const SHADES = 4

// Density in [0, 1] at a point. simplex morphs noise in place along its third axis; warp
// (after Paper's "warp") folds noise through itself with an offset that circles every 12 s.
function shapeAt(f: Field, x: number, y: number, t: number): number {
  if (f.shape === 'simplex') return Math.min(1, Math.max(0, (fbm3(x, y, t * f.speed * 0.5) - 0.5) * 2.2 + 0.5) * f.density)
  const a = t * f.speed * Math.PI * 2 / 12, ox = Math.cos(a) * 0.6, oy = Math.sin(a) * 0.6
  const q = fbm3(x + ox, y + oy, 0)
  return Math.min(1, Math.pow(fbm3(x + f.warp * q + oy, y + f.warp * q + ox, 0), 1.4) * 1.2 * f.density)
}

// One frame of the pack's field at t seconds, drawn live by client/field.tsx on every tick. The
// field is a grid of braille dots; `size` dots square make one dither pixel, sampled once at its
// centre, and each pixel meets its own Bayer threshold. Space is centred, one unit the field's height.
// Where each dither pixel samples the shape, which only the time changes between ticks, so it is
// worked out once per size and framing: the pixel grid's width, then x and y interleaved.
type Grid = { key: string; bw: number; xy: Float64Array }
let grid: Grid = { key: '', bw: 0, xy: new Float64Array(0) }
function gridFor(cols: number, rows: number, f: Field): Grid {
  const key = [cols, rows, f.size, f.scale, f.rotation, f.offsetX, f.offsetY].join()
  if (grid.key === key) return grid
  const W = cols * 2, H = rows * 4, sz = f.size, freq = 1.6 / f.scale
  const bw = Math.ceil(W / sz), bh = Math.ceil(H / sz), rad = f.rotation * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad)
  const xy = new Float64Array(bw * bh * 2)
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const u = ((bx + 0.5) * sz - W / 2) / H - f.offsetX, v = ((by + 0.5) * sz - H / 2) / H - f.offsetY, i = (by * bw + bx) * 2
    xy[i] = (u * cs - v * sn) * freq
    xy[i + 1] = (u * sn + v * cs) * freq
  }
  return (grid = { key, bw, xy })
}

export function fieldFrame(cols: number, rows: number, colors: Colors, t: number, f: Field): Seg[][] {
  const dark = mix(colors.faint, '#000000', 0.55)
  const shade = Array.from({ length: SHADES }, (_, i) => mix(dark, colors.accent, i / (SHADES - 1)))
  const m = BAYER[f.dither], side = m.length, cut = side * side, sz = f.size
  const { bw, xy } = gridFor(cols, rows, f)
  const density = new Float64Array(xy.length / 2).fill(-1)
  const at = (bx: number, by: number) => {
    const i = by * bw + bx
    if (density[i]! < 0) density[i] = shapeAt(f, xy[i * 2]!, xy[i * 2 + 1]!, t)
    return density[i]!
  }
  const frame: Seg[][] = []
  for (let r = 0; r < rows; r++) {
    const cells: Seg[] = []
    for (let c = 0; c < cols; c++) {
      let bits = 0, sum = 0
      for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) {
        const bx = Math.floor((c * 2 + x) / sz), by = Math.floor((r * 4 + y) / sz), d = at(bx, by)
        sum += d
        if (d > (m[by % side]![bx % side]! + 0.5) / cut) bits |= DOT[y]![x]!
      }
      cells.push(bits ? { text: String.fromCharCode(0x2800 + bits), color: shade[Math.min(SHADES - 1, Math.floor((sum / 8) * SHADES))]! } : { text: ' ', color: dark })
    }
    frame.push(runs(cells))
  }
  return frame
}

// One bar per window: the fill ramps from accent to text, its edge dissolves through ▓▒░,
// and what is used is a row of faint dots.
function bar(label: string, left: number, tail: string, width: number, c: Colors): Seg[] {
  const pct = ` ${left}%`, room = Math.max(4, width - label.length - 1 - pct.length - (tail ? tail.length + 1 : 0))
  const fill = Math.round((left / 100) * room), edge = Math.max(0, fill - 3)
  const cells: Seg[] = []
  for (let i = 0; i < room; i++) {
    if (i < edge) cells.push({ text: '█', color: mix(c.accent, c.text, i / Math.max(1, fill)) })
    else if (i < fill) cells.push({ text: '▓▒░'[i - edge]!, color: c.text })
    else cells.push({ text: '·', color: c.faint })
  }
  return [{ text: label + ' ', color: c.dim }, ...runs(cells), { text: pct, color: c.text, bold: true }, ...(tail ? [{ text: ' ' + tail, color: c.dim }] : [])]
}

export function ditherMeters(width: number, windows: Window[], ctxPercent: number, c: Colors): Seg[][] {
  if (!windows.length) return [bar('ctx', 100 - Math.round(ctxPercent), '', width, c)]
  return windows.map(w => bar(w.label, 100 - w.usedPercent, w.reset, width, c))
}

export const turnDivider = (turn: number, c: Colors): Divider => ({
  left: [{ text: '░▒▓━━ ', color: c.faint }, { text: String(turn).padStart(2, '0'), color: c.accent, bold: true }, { text: ' ', color: c.faint }],
  fill: { text: '━', color: c.faint },
  right: [{ text: '▓▒░', color: c.faint }],
})
