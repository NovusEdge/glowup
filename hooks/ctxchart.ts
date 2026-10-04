import type { Theme } from './themes.ts'
import { mix } from './color.ts'
import { fit, visibleLength, type Seg } from './layout.tsx'

export type Cat = { name: string; tokens: number; kind: string }

const SHORT: [RegExp, string][] = [
  [/system prompt/i, 'system'], [/system tools/i, 'tools'], [/mcp/i, 'mcp'], [/memory/i, 'memory'],
  [/messages?/i, 'messages'], [/skills?/i, 'skills'], [/custom agents?/i, 'agents'], [/deferred/i, 'deferred'],
]
export const shortName = (name: string) => SHORT.find(([re]) => re.test(name))?.[1] ?? name.toLowerCase().slice(0, 10)

// 124000 -> 124k, 1500000 -> 1.5M
export const tokensK = (n: number) => n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n))

const HEX = /^#[0-9a-f]{6}$/i
const SHADES = ['█', '▓', '▒', '░']

// Role colors in the order they read best next to each other, then blends of
// neighbours for the sixth segment on. Duplicates (a theme that reuses a color) are dropped.
function palette(t: Theme, n: number): string[] {
  const c = t.colors
  const out: string[] = []
  for (const col of [c.read, c.agent, c.shell, c.edit, c.accent]) if (!out.includes(col)) out.push(col)
  for (let i = 0; out.length < n && i < 12; i++) {
    const m = HEX.test(out[i]!) && HEX.test(out[i + 1] ?? '') ? mix(out[i]!, out[i + 1]!, 0.5) : out[i]!
    if (!out.includes(m)) out.push(m)
  }
  return out.slice(0, n)
}

export type Slice = { label: string; pct: number; color: string; glyph: string; cells: number }
export type Stack = { segs: Seg[]; slices: Slice[] }

const MAX_SLICES = 6

// One bar of exactly `width` cells. Shares are tokens over the window; the rest is free.
// Largest-remainder rounding keeps the cells summing to the width.
export function stackBar(cats: Cat[], maxTokens: number | undefined, percent: number, width: number, t: Theme): Stack {
  const used = cats.filter(x => x.kind === 'used' && x.tokens > 0).sort((a, b) => b.tokens - a.tokens)
  let parts: { label: string; share: number }[]
  if (used.length && maxTokens) {
    parts = used.slice(0, MAX_SLICES - 1).map(x => ({ label: shortName(x.name), share: x.tokens / maxTokens }))
    const rest = used.slice(MAX_SLICES - 1).reduce((n, x) => n + x.tokens, 0)
    if (rest > 0) parts.push({ label: 'other', share: rest / maxTokens })
  } else parts = percent > 0 ? [{ label: 'used', share: percent / 100 }] : []
  const total = parts.reduce((n, p) => n + p.share, 0)
  if (total > 1) parts = parts.map(p => ({ ...p, share: p.share / total }))
  const free = Math.max(0, 1 - Math.min(1, total))
  const shares = [...parts.map(p => p.share), free]
  const exact = shares.map(s => s * width)
  const cells = exact.map(Math.floor)
  let left = width - cells.reduce((a, b) => a + b, 0)
  for (const i of exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]).map(x => x[1])) { if (left <= 0) break; cells[i]!++; left-- }

  const cols = palette(t, parts.length)
  const colorsOk = cols.length >= parts.length && cols.every(x => HEX.test(x))
  const slices: Slice[] = parts.map((p, i) => ({
    label: p.label, pct: Math.round(p.share * 100), cells: cells[i]!,
    color: colorsOk ? cols[i]! : t.colors.text, glyph: colorsOk ? '█' : SHADES[i % SHADES.length]!,
  }))
  const segs: Seg[] = slices.filter(s => s.cells > 0).map(s => ({ text: s.glyph.repeat(s.cells), color: s.color }))
  // '░' is one of the fallback shades, so the mono bar keeps dots for free space
  if (cells.at(-1)) segs.push({ text: (colorsOk ? '░' : '·').repeat(cells.at(-1)!), color: t.colors.faint })
  return { segs, slices }
}

// The bar with its end caps, `width` cells in all.
export function capped(s: Stack, t: Theme): Seg[] {
  return [{ text: ' ▕', color: t.colors.faint }, ...s.segs, { text: '▏', color: t.colors.faint }]
}

// Legend items packed into rows of at most `width` cells.
export function legendRows(slices: Slice[], width: number, t: Theme): Seg[][] {
  const rows: Seg[][] = [], gap: Seg = { text: '   ', color: t.colors.text }
  let row: Seg[] = []
  for (const s of slices.filter(x => x.cells > 0)) {
    const item: Seg[] = [{ text: s.glyph === '█' ? '● ' : s.glyph + ' ', color: s.color }, { text: `${s.label} ${s.pct}%`, color: t.colors.dim }]
    if (row.length && visibleLength([...row, gap, ...item]) > width) { rows.push(row); row = [] }
    row = row.length ? [...row, gap, ...item] : item
  }
  if (row.length) rows.push(row)
  return rows.map(r => fit(r, width))
}

const BLOCKS = '▁▂▃▄▅▆▇█'
export const sparkline = (samples: number[]) => samples.map(v => BLOCKS[Math.max(0, Math.min(7, Math.floor(v / 100 * 8)))]!).join('')
