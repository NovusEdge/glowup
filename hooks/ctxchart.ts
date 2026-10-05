import type { ModelUsage, SessionContextBreakdown } from 'claude-code'
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

// Puts a marker glyph over cell `at` of a bar, splitting whichever segment covers it.
export function markBar(segs: Seg[], at: number, mark: Seg): Seg[] {
  const out: Seg[] = []
  let pos = 0
  for (const s of segs) {
    const chars = [...s.text], end = pos + chars.length
    if (at >= pos && at < end) {
      const i = at - pos
      if (i) out.push({ ...s, text: chars.slice(0, i).join('') })
      out.push(mark)
      if (i + 1 < chars.length) out.push({ ...s, text: chars.slice(i + 1).join('') })
    } else out.push(s)
    pos = end
  }
  return out
}

// Braille dot bits by dot row (top to bottom) and column (left, right) within one cell.
const DOT = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]] as const

// A two-row braille area chart with eight dot levels for 0-100%: one sample per cell while they
// fit, two per cell (one per dot column) once they do not, so a short session is not squeezed left.
// `line` draws a dashed horizontal rule at that percent across every cell, data or not.
// data[i] says whether cell i holds samples, so the caller can color the rule apart.
export function brailleArea(samples: number[], cols: number, line?: number): { rows: [string, string]; data: boolean[] } {
  const wide = samples.length <= cols
  const s = samples.slice(-cols * 2)
  const bits = [new Array<number>(cols).fill(0), new Array<number>(cols).fill(0)]
  const set = (dot: number, col: number, side: 0 | 1) => { bits[dot >> 2]![col]! |= DOT[dot & 3]![side] }
  s.forEach((v, i) => {
    const h = Math.max(v > 0 ? 1 : 0, Math.min(8, Math.round(v / 100 * 8)))
    for (let d = 0; d < h; d++) {
      if (wide) { set(7 - d, i, 0); set(7 - d, i, 1) } else set(7 - d, i >> 1, (i & 1) as 0 | 1)
    }
  })
  if (line !== undefined) {
    const dot = 8 - Math.max(1, Math.min(8, Math.round(line / 100 * 8)))
    for (let c = 0; c < cols; c++) set(dot, c, 0)
  }
  const row = (b: number[]) => b.map(x => (x ? String.fromCharCode(0x2800 + x) : ' ')).join('')
  const filled = wide ? s.length : Math.ceil(s.length / 2)
  return { rows: [row(bits[0]!), row(bits[1]!)], data: Array.from({ length: cols }, (_, i) => i < filled) }
}

// Percent points gained per turn over the last few samples since the last drop (a compaction or /clear).
export function growth(samples: number[], span = 6): number | undefined {
  let start = samples.length - 1
  while (start > 0 && samples[start - 1]! <= samples[start]!) start--
  const run = samples.slice(Math.max(start, samples.length - span))
  return run.length < 2 ? undefined : (run.at(-1)! - run[0]!) / (run.length - 1)
}

export type Heavy = { kind: string; name: string; tokens: number; note?: string }

// The context's biggest single sources the person can do something about: an MCP server's
// loaded tool schemas, a memory file, the skill listing, the custom agent listing.
export function heaviest(b: Pick<SessionContextBreakdown, 'memoryFiles' | 'mcpTools' | 'agents' | 'skills'>, n = 3): Heavy[] {
  const out: Heavy[] = []
  const servers = new Map<string, { tokens: number; count: number }>()
  for (const t of b.mcpTools ?? []) {
    if (!t.isLoaded) continue
    const s = servers.get(t.serverName) ?? { tokens: 0, count: 0 }
    servers.set(t.serverName, { tokens: s.tokens + t.tokens, count: s.count + 1 })
  }
  for (const [name, s] of servers) out.push({ kind: 'mcp', name, tokens: s.tokens, note: `${s.count} tool${s.count === 1 ? '' : 's'}` })
  for (const f of b.memoryFiles ?? []) out.push({ kind: 'memory', name: f.path.split(/[\\/]/).pop() || f.path, tokens: f.tokens, note: f.type.toLowerCase() })
  if (b.skills?.tokens) out.push({ kind: 'skills', name: `${b.skills.includedSkills} listed`, tokens: b.skills.tokens })
  const agents = (b.agents ?? []).reduce((n, a) => n + a.tokens, 0)
  if (agents) out.push({ kind: 'agents', name: `${b.agents.length} defined`, tokens: agents })
  return out.filter(x => x.tokens > 0).sort((a, b) => b.tokens - a.tokens).slice(0, n)
}

// Share of the last request's input the prompt cache served, as a whole percent.
export function cacheHit(u: ModelUsage | null | undefined): number | undefined {
  if (!u) return undefined
  const all = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
  return all > 0 ? Math.round(u.cache_read_input_tokens / all * 100) : undefined
}
