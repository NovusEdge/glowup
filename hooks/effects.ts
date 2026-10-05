// The built-in answers to glowup.field, glowup.meter and glowup.divider, which a pack picks
// with motion.field, colors.meters and colors.dividers. A renderer plugin that answers first wins.
import type { Seg } from './layout.tsx'
import type { Colors } from './themes.ts'
import type { Divider, Frames, Window } from './renderers.ts'
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

// 8x8 Bayer thresholds; a braille cell is 2 dots across and 4 down.
const BAYER = (() => {
  let m = [[0]]
  for (let n = 1; n < 8; n *= 2) m = Array.from({ length: n * 2 }, (_, y) => Array.from({ length: n * 2 }, (_, x) => m[y % n]![x % n]! * 4 + [[0, 2], [3, 1]][Math.floor(y / n)]![Math.floor(x / n)]!))
  return m
})()
const DOT = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]]

const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s) }
const ease = (t: number) => t * t * (3 - 2 * t)
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), u = ease(x - ix), v = ease(y - iy)
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const fbm = (x: number, y: number) => noise(x, y) * 0.55 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.15

export const WARP_FRAMES = 36
const WARP_MS = 110
// Each shade change starts a new segment, and the player's props hold at most PROPS_BUDGET characters.
const SHADES = 4

// Domain-warped noise, after Paper's "warp" dithering shader. The offset walks a circle,
// so the last frame flows back into the first and the loop has no seam.
export function warpFrames(cols: number, rows: number, colors: Colors, still: boolean): Frames {
  const dark = mix(colors.faint, '#000000', 0.55)
  const shade = Array.from({ length: SHADES }, (_, i) => mix(dark, colors.accent, i / (SHADES - 1)))
  const aspect = cols * 2 / (rows * 4)
  const frames: Seg[][][] = []
  for (let f = 0; f < (still ? 1 : WARP_FRAMES); f++) {
    const a = (f / WARP_FRAMES) * Math.PI * 2, ox = Math.cos(a) * 0.6, oy = Math.sin(a) * 0.6
    const frame: Seg[][] = []
    for (let r = 0; r < rows; r++) {
      const cells: Seg[] = []
      for (let c = 0; c < cols; c++) {
        let bits = 0, sum = 0
        // sampled once per half cell, a quarter of the work; each dot still meets its own Bayer threshold
        for (let h = 0; h < 2; h++) {
          const u = ((c * 2 + 1) / (cols * 2)) * 2 * aspect, v = ((r * 4 + h * 2 + 1) / (rows * 4)) * 2
          const q = fbm(u * 1.6 + ox, v * 1.6 + oy)
          const d = Math.min(1, Math.pow(fbm(u * 1.6 + 4 * q + oy, v * 1.6 + 4 * q + ox), 1.4) * 1.2)
          sum += d
          for (let y = h * 2; y < h * 2 + 2; y++) for (let x = 0; x < 2; x++) {
            if (d > (BAYER[(r * 4 + y) % 8]![(c * 2 + x) % 8]! + 0.5) / 64) bits |= DOT[y]![x]!
          }
        }
        cells.push(bits ? { text: String.fromCharCode(0x2800 + bits), color: shade[Math.min(SHADES - 1, Math.floor((sum / 2) * SHADES))]! } : { text: ' ', color: dark })
      }
      frame.push(runs(cells))
    }
    frames.push(frame)
  }
  return { ms: WARP_MS, frames }
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
