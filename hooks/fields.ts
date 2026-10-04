import { agentsRunning, type Model, type RateLimit } from './model.ts'
import type { Colors, Theme } from './themes.ts'
import { localTime } from './eggs.ts'

export const FIELD_IDS = ['activity', 'ctx', '5h', 'week', 'cost', 'model', 'agents', 'plan', 'branch', 'changes', 'cwd'] as const
export type FieldId = (typeof FIELD_IDS)[number]
export const DEFAULT_FIELDS: readonly FieldId[] = ['activity', 'ctx', '5h', 'week']
export const isFieldId = (s: string): s is FieldId => (FIELD_IDS as readonly string[]).includes(s)

export function parseFields(v: unknown): FieldId[] | undefined {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []
  const ids = [...new Set(raw.filter((s): s is string => typeof s === 'string').map(s => s.trim()).filter(isFieldId))]
  return ids.length ? ids : undefined
}

export type ColorMode = 'plain' | 'truecolor' | '256'
type Span = { text: string; color?: keyof Colors }

const WORD: Record<string, string> = { '▸': 'reading', '⌕': 'searching', '✎': 'editing', $: 'running', '◆': 'delegating', '✗': 'failing', '✓': 'passing', '!': 'waiting' }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const tone = (p: number): keyof Colors => p >= 80 ? 'fail' : p >= 50 ? 'edit' : 'pass'

// Rounded down: "↻0m" would read as already reset.
function resetIn(resetsAt: string | undefined, now: number, tzOffset: number): string {
  const at = resetsAt === undefined ? NaN : Date.parse(resetsAt)
  if (Number.isNaN(at)) return ''
  const mins = Math.floor((at - now) / 60_000)
  if (mins < 1) return ' ↻<1m'
  if (mins < 60) return ` ↻${mins}m`
  if (mins < 24 * 60) return ` ↻${Math.floor(mins / 60)}h${mins % 60}m`
  return ` ↻${DAYS[localTime(at, tzOffset).day]}`
}

// The figure is this session's last reading; once the window resets it no longer holds.
export function liveLimit(m: Model, kind: string, now: number): RateLimit | undefined {
  const w = m.limits.find(l => l.kind === kind)
  return !w || (w.resetsAt !== undefined && Date.parse(w.resetsAt) <= now) ? undefined : w
}

function field(id: FieldId, m: Model, now: number, tzOffset: number): Span[] | undefined {
  const window = (kind: string, label: string): Span[] | undefined => {
    const w = liveLimit(m, kind, now)
    if (!w) return undefined
    return [{ text: label + ' ', color: 'dim' }, { text: `${w.percentUsed}%`, color: tone(w.percentUsed) }, { text: resetIn(w.resetsAt, now, tzOffset), color: 'dim' }]
  }
  switch (id) {
    case 'activity': {
      const word = m.working ? (Object.hasOwn(WORD, m.act.glyph) ? WORD[m.act.glyph]! : 'thinking') : agentsRunning(m) ? 'delegating' : 'idle'
      return [{ text: '◆ ', color: 'accent' }, { text: word, color: 'text' }]
    }
    case 'ctx': return m.ctxPercent ? [{ text: 'ctx ', color: 'dim' }, { text: `${m.ctxPercent}%`, color: tone(m.ctxPercent) }] : undefined
    case '5h': return window('five_hour', '5h')
    case 'week': return window('seven_day', 'wk')
    case 'cost': return m.costUsd === undefined ? undefined : [{ text: `$${m.costUsd.toFixed(2)}`, color: 'text' }]
    case 'model': return m.modelName ? [{ text: m.modelName, color: 'text' }] : undefined
    case 'agents': {
      const n = m.agents.filter(a => a.state === 'running').length
      return n ? [{ text: `${n} agent${n === 1 ? '' : 's'}`, color: 'text' }] : undefined
    }
    case 'plan': {
      if (!m.plan.length) return undefined
      const done = m.plan.filter(p => p.status === 'completed').length
      return [{ text: 'plan ', color: 'dim' }, { text: `${done}/${m.plan.length}`, color: 'text' }]
    }
    case 'branch': return m.branch ? [{ text: m.branch, color: 'text' }] : undefined
    case 'changes': {
      const add = m.files.reduce((s, f) => s + f.add, 0), del = m.files.reduce((s, f) => s + f.del, 0)
      return add || del ? [{ text: `+${add}`, color: 'pass' }, { text: ' ' }, { text: `−${del}`, color: 'fail' }] : undefined
    }
    case 'cwd': return m.root ? [{ text: m.root.replace(/\/+$/, '').split('/').pop() || '/', color: 'text' }] : undefined
  }
}

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const cube = (c: number) => c < 48 ? 0 : c < 115 ? 1 : Math.floor((c - 35) / 40)
function escape(hex: string, mode: Exclude<ColorMode, 'plain'>): string {
  const [r, g, b] = rgb(hex)
  return mode === 'truecolor' ? `\x1b[38;2;${r};${g};${b}m` : `\x1b[38;5;${16 + 36 * cube(r) + 6 * cube(g) + cube(b)}m`
}
const paint = (spans: Span[], t: Theme, mode: ColorMode) =>
  spans.map(s => mode === 'plain' || !s.color || !s.text ? s.text : `${escape(t.colors[s.color], mode)}${s.text}\x1b[39m`).join('')

export function renderFields(m: Model, t: Theme, fields: readonly FieldId[], o: { now: number; tzOffset: number; color: ColorMode }): string {
  const parts = fields.map(id => field(id, m, o.now, o.tzOffset)).filter((s): s is Span[] => s !== undefined)
  return parts.map(s => paint(s, t, o.color)).join(paint([{ text: ' · ', color: 'dim' }], t, o.color))
}
