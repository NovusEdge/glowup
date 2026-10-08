import type { ContextCategoryKind } from 'claude-code'
import { normalizeModel, planFold, type Model, type PlanItem } from './model.ts'
import { legendRows, stackBar, type Heavy } from './ctxchart.ts'
import { brailleArea, chartTop, markBar, outlook, tokensK } from './trend.ts'
import { planOrder } from './tasks.ts'
import type { Theme } from './themes.ts'
import { shortPath } from './events.ts'
import type { Border, Look } from './packs.ts'
import { wrapBubble } from './bubbles.ts'
import type { Moment } from './lines.ts'
import { CLAWD_ROW, PET_ROWS, type PetId } from './pets.ts'
import { comboSegs, fit, hearts, hpBar, renderSegs, toneColor, visibleLength, type Seg } from './layout.tsx'
import { liveLimit } from './fields.ts'
import { DEFAULT_SETUP, type Meter, type TabId } from './setup.ts'
import type { DiffLine, Diffs } from './diff.ts'

export type { TabId }
// ctx comes from the context breakdown: threshold is the auto-compact point in tokens (absent when it is off),
// window the model's window that m.ctxPercent and m.ctxHistory are measured against.
export type CtxDetail = { autoCompact: boolean; threshold?: number; window?: number; heavy: Heavy[]; cacheHit?: number }
export type PaneView = { tab: TabId; offset?: number; categories?: { name: string; tokens: number; kind: ContextCategoryKind }[]; maxTokens?: number; ctx?: CtxDetail; reduced?: boolean; meter?: Meter; diff?: Diffs }
export const TABS: [TabId, string][] = [['plan', 'Plan & context'], ['agents', 'Agents'], ['diff', 'Diff'], ['changes', 'Changes']]
export function visibleTabs(order: readonly TabId[] | undefined, open: TabId): { tabs: [TabId, string][]; tab: TabId } {
  const tabs = order ? order.map(id => TABS.find(([t]) => t === id)!).filter(Boolean) : TABS
  return { tabs, tab: tabs.some(([id]) => id === open) ? open : tabs[0]![0] }
}
// The compact drawer sits under a one-row tab strip in a short space.
export const COMPACT_ROWS = 6
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

const gap = (n: number, t: Theme): Seg => ({ text: ' '.repeat(Math.max(1, n)), color: t.colors.text })
const header = (left: string, right: string, w: number, t: Theme): Seg[] => {
  const l: Seg = { text: left, color: t.colors.text, bold: true }, r: Seg = { text: right, color: t.colors.dim }
  return fit([l, gap(w - visibleLength([l]) - visibleLength([r]), t), r], w)
}
// The left part shrinks so the right part always shows, flush to the edge.
const spread = (left: Seg[], right: Seg[], w: number, t: Theme): Seg[] => {
  const rl = visibleLength(right)
  const l = fit(left, Math.max(1, w - rl - 1))
  return fit([...l, gap(w - visibleLength(l) - rl, t), ...right], w)
}
const secs = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`
const k = (n?: number) => (n === undefined ? '…' : `${(n / 1000).toFixed(1)}k`)
// Keeps `reserve` rows free for what the caller appends after the list.
const cap = (rows: Seg[][], t: Theme, w: number, reserve = 0, limit = COMPACT_ROWS): Seg[][] => {
  const room = limit - reserve
  if (rows.length <= room) return rows
  return [...rows.slice(0, room - 1), fit([{ text: `  … ${rows.length - room + 1} more`, color: t.colors.dim }], w)]
}

// The glyphs Ink draws for each borderStyle, so section boxes match the status box.
export const BOX: Record<Border, { tl: string; tr: string; bl: string; br: string; h: string; v: string }> = {
  round: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
  single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
  bold: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
  classic: { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' },
}
export const MIN_BOX = 16
export const boxInner = (w: number) => (w >= MIN_BOX ? w - 4 : w)

// Top edge: corner, rule, title, rule fill, right text, rule, corner. The right text goes first when room runs out.
export function section(title: string, right: string, body: Seg[][], w: number, t: Theme, border: Border = 'round'): Seg[][] {
  if (w < MIN_BOX) return [header(title, right, w, t), ...body.map(r => fit(r, w))]
  const b = BOX[border], inner = w - 4
  const edge = (s: string): Seg => ({ text: s, color: t.colors.faint })
  const name: Seg = { text: ` ${title} `, color: t.colors.text, bold: true }
  let tail: Seg[] = right ? [{ text: ` ${right} `, color: t.colors.dim }] : []
  if (visibleLength([name, ...tail]) > w - 5) tail = []
  const label = fit([name], w - 5)
  const fill = w - 4 - visibleLength(label) - visibleLength(tail)
  const top = [edge(b.tl + b.h), ...label, edge(b.h.repeat(fill)), ...tail, edge(b.h + b.tr)]
  const row = (r: Seg[]): Seg[] => {
    const c = fit(r, inner)
    return [edge(b.v + ' '), ...c, { text: ' '.repeat(inner - visibleLength(c) + 1), color: t.colors.text }, edge(b.v)]
  }
  return [top, ...body.map(row), [edge(b.bl + b.h.repeat(w - 2) + b.br)]]
}

type Part = { rows: Seg[][]; n: number }

function fileRow(f: Model['files'][number], t: Theme, iw: number, lead: string): Seg[] {
  const c = t.colors, name = shortPath(f.path) + (f.how === 'new' ? '  new' : '')
  const left: Seg[] = [{ text: lead, color: c.text }, { text: '✎ ', color: c.edit }, { text: name, color: c.text }]
  const right: Seg[] = [{ text: `+${f.add}`, color: c.pass }, { text: ` −${f.del}`, color: c.fail }]
  return spread(left, right, iw, t)
}

function changes(m: Model, t: Theme, w: number, compact: boolean, limit: number, border: Border): Part {
  const c = t.colors, list = m.files
  const add = list.reduce((n, f) => n + f.add, 0), del = list.reduce((n, f) => n + f.del, 0)
  const lead = compact ? '  ' : '', iw = compact ? w : boxInner(w)
  const body: Seg[][] = []
  if (!list.length) body.push([{ text: lead + 'Nothing changed yet.', color: c.dim }])
  for (const f of list) body.push(fileRow(f, t, iw, lead))
  if (compact) return { rows: cap(body, t, w, 0, limit).map(r => fit(r, w)), n: -1 }
  return { rows: section('CHANGES', `${list.length} files  +${add} −${del}`, body, w, t, border), n: body.length }
}

const DIFF_LINES = 2000

// The colored bar runs the full width, so a changed line reads as a band and not as text.
function diffRow(l: DiffLine, t: Theme, iw: number, lead: string): Seg[] {
  const c = t.colors, room = Math.max(1, iw - lead.length)
  const color = l.kind === 'add' ? c.pass : l.kind === 'del' ? c.fail : l.kind === 'ctx' ? c.text : c.dim
  const bg = l.kind === 'add' ? c.addBg : l.kind === 'del' ? c.delBg : undefined
  const cut = fit([{ text: l.text, color, bg }], room)
  const pad = bg ? room - visibleLength(cut) : 0
  return [{ text: lead, color: c.text }, ...cut, ...(pad > 0 ? [{ text: ' '.repeat(pad), color, bg }] : [])]
}

function diff(m: Model, t: Theme, v: PaneView, w: number, compact: boolean, limit: number, border: Border): Part {
  const c = t.colors, list = m.files
  const add = list.reduce((n, f) => n + f.add, 0), del = list.reduce((n, f) => n + f.del, 0)
  const lead = compact ? '  ' : '', iw = compact ? w : boxInner(w)
  const body: Seg[][] = []
  if (!list.length) body.push([{ text: lead + 'Nothing changed yet.', color: c.dim }])
  let total = 0, shown = 0
  for (const f of list) {
    body.push(fileRow(f, t, iw, lead))
    for (const l of v.diff?.[f.path] ?? []) {
      total++
      if (shown < DIFF_LINES) { shown++; body.push(diffRow(l, t, iw, lead)) }
    }
  }
  if (total > shown) body.push(fit([{ text: `${lead}… ${total - shown} more lines`, color: c.dim }], iw))
  if (compact) return { rows: cap(body, t, w, 0, limit).map(r => fit(r, w)), n: -1 }
  return { rows: section('DIFF', `${list.length} files  +${add} −${del}`, body, w, t, border), n: body.length }
}

function agents(m: Model, t: Theme, v: PaneView, w: number, compact: boolean, now: number, limit: number, border: Border): Part {
  const c = t.colors, live = m.agents.filter(a => a.state === 'running').length, iw = boxInner(w)
  const body: Seg[][] = []
  if (!m.agents.length) body.push([{ text: (compact ? '  ' : '') + 'No subagents this session.', color: c.dim }])
  for (const a of m.agents) {
    const running = a.state === 'running'
    const spin = v.reduced ? '◌' : SPIN[Math.floor(now / 90) % SPIN.length]!
    const mark: Seg = { text: running ? spin : '✓', color: running ? c.agent : c.pass }
    if (compact) { body.push(fit([{ text: ` ◆ ${a.name} `, color: c.agent, bold: true }, mark, { text: ' ' + (running ? a.now ?? a.task : a.task), color: running ? c.read : c.dim }], w)); continue }
    if (body.length) body.push([])
    const when = `${secs((a.endedAt ?? now) - a.startedAt)} · ${k(a.tokens)} `
    body.push(spread([{ text: '◆ ' + a.name, color: c.agent, bold: true }], [{ text: when, color: c.dim }, mark], iw, t))
    body.push(fit([{ text: '  ' + a.task, color: c.text }], iw))
    if (running && a.now) body.push(fit([{ text: '  └ ', color: c.faint }, { text: a.now, color: c.read }], iw))
  }
  if (compact) return { rows: cap(body, t, w, 0, limit), n: -1 }
  return { rows: section('AGENTS', `${live} running · ${m.agents.length - live} done`, body, w, t, border), n: body.length }
}

function planRow(p: PlanItem, t: Theme, w: number, lead: string): Seg[] {
  const c = t.colors, on = p.status === 'in_progress', done = p.status === 'completed'
  const g = done ? '✓' : on ? '◉' : '○'
  return fit([{ text: `${lead}${g} `, color: done ? c.pass : on ? c.accent : c.dim }, { text: on && p.active ? p.active : p.title, color: done ? c.dim : c.text, bold: on }], w)
}

// The bar measures against the breakdown's window; the history against the model's, which can be larger.
function markCompact(segs: Seg[], v: PaneView, w: number, t: Theme): Seg[] {
  const at = v.ctx?.threshold, max = v.maxTokens
  if (!at || !max) return segs
  return markBar(segs, Math.min(w - 1, Math.floor(at / max * w)), { text: '┊', color: t.colors.text })
}

// Cells holding samples in the accent color, the rest (the auto-compact rule alone) dim.
const chartRow = (row: string, data: boolean[], t: Theme): Seg[] =>
  [...row].reduce<Seg[]>((out, ch, i) => {
    const color = data[i] ? t.colors.accent : t.colors.dim, last = out.at(-1)
    if (last?.color === color) last.text += ch
    else out.push({ text: ch, color })
    return out
  }, [])

function trend(m: Model, v: PaneView, w: number, t: Theme): Seg[][] {
  if (!m.ctxHistory.length) return []
  const win = v.ctx?.window, line = v.ctx?.threshold && win ? v.ctx.threshold / win * 100 : undefined
  // the chart's ceiling sits at the right end of the top row; it is the auto-compact point when the rule shows
  const top = chartTop(m.ctxHistory, line)
  const label = w >= 24 ? ` ${Math.round(top)}%`.padStart(5) : ''
  const { rows, data } = brailleArea(m.ctxHistory, w - label.length, line, top)
  const says = outlook(m.ctxHistory, m.ctxPercent, v.ctx?.autoCompact, line, win)
  const out = rows.map(r => chartRow(r, data, t))
  if (label) out[0]!.push({ text: label, color: t.colors.dim })
  if (says) out.push(fit([{ text: says, color: t.colors.dim }], w))
  return out
}

const KIND_COLS = 7
const heavyRow = (h: Heavy, w: number, t: Theme): Seg[] => spread(
  [{ text: h.kind.padEnd(KIND_COLS), color: t.colors.dim }, { text: h.name, color: t.colors.text }, ...(h.note ? [{ text: '  ' + h.note, color: t.colors.dim }] : [])],
  [{ text: tokensK(h.tokens), color: t.colors.text }], w, t)

function stats(m: Model, v: PaneView, w: number, t: Theme): Seg[] | undefined {
  const says: string[] = []
  if (v.ctx?.cacheHit !== undefined) says.push(`cache hit ${v.ctx.cacheHit}%`)
  if (m.ctxHistory.length || m.compactions) says.push(`peak ${Math.max(m.ctxPeak, ...m.ctxHistory)}%`)
  if (m.compactions) says.push(`compacted ${m.compactions}×`)
  return says.length ? fit([{ text: says.join(' · '), color: t.colors.dim }], w) : undefined
}

function plan(m: Model, t: Theme, v: PaneView, w: number, compact: boolean, limit: number, border: Border): Part {
  const c = t.colors, done = m.plan.filter(p => p.status === 'completed').length
  const used = m.ctxPercent, cats = v.categories ?? []
  const { items: shown, hiddenDone } = planOrder(m.plan)
  const lead = compact ? '  ' : '', iw = compact ? w : boxInner(w)
  const folded = planFold(m)
  const items: Seg[][] = folded === undefined ? shown.map(p => planRow(p, t, iw, lead)) : [[{ text: lead, color: c.text }, { text: `✓ plan done · ${folded} task${folded === 1 ? '' : 's'}`, color: c.pass }]]
  if (!m.plan.length) items.push([{ text: lead + 'No task list yet.', color: c.dim }])
  if (compact) {
    const inner = Math.max(4, w - 12)
    const ctx = fit([{ text: ' ctx ▕', color: c.dim }, ...markCompact(stackBar(cats, v.maxTokens, used, inner, t).segs, v, inner, t), { text: `▏${String(used).padStart(4)}%`, color: c.text }], w)
    return { rows: [...cap(items, t, w, 1, limit), ctx], n: -1 }
  }
  if (hiddenDone && folded === undefined) items.push([{ text: `  +${hiddenDone} more done`, color: c.dim }])
  const usedTokens = cats.some(x => x.kind === 'used') ? cats.filter(x => x.kind === 'used').reduce((n, x) => n + x.tokens, 0) : v.maxTokens ? used / 100 * v.maxTokens : undefined
  const stack = stackBar(cats, v.maxTokens, used, iw, t)
  const ctx: Seg[][] = [markCompact(stack.segs, v, iw, t), ...legendRows(stack.slices, iw, t)]
  const chart = trend(m, v, iw, t)
  if (chart.length) ctx.push([], ...chart)
  const heavy = v.ctx?.heavy ?? []
  if (heavy.length) ctx.push([], ...heavy.map(h => heavyRow(h, iw, t)))
  const tail = stats(m, v, iw, t)
  if (tail) ctx.push(...(chart.length || heavy.length ? [] : [[]]), tail)
  if (used >= (v.meter ?? DEFAULT_SETUP.meter).danger) {
    const top = stack.slices[0]
    ctx.push([{ text: `! ${top && top.label !== 'used' ? `${top.label} is the biggest share` : `context ${used}% used`}`, color: c.edit }])
  }
  return {
    rows: [
      ...section('PLAN', m.plan.length ? `${done}/${m.plan.length}` : '', items, w, t, border),
      [],
      ...section('CONTEXT', v.maxTokens && usedTokens !== undefined ? `${used}% · ${tokensK(usedTokens)} / ${tokensK(v.maxTokens)}` : `${used}% used`, ctx, w, t, border),
    ],
    n: items.length,
  }
}

// body is the half-open row range of the first section's body: row 0 is its top edge (or the unboxed header).
export function tabParts(model: Model, t: Theme, v: PaneView, width: number, compact: boolean, now: number, limit = COMPACT_ROWS, border: Border = 'round'): { rows: Seg[][]; body: [number, number] } {
  const m = normalizeModel(model)
  const { rows, n } = v.tab === 'changes' ? changes(m, t, width, compact, limit, border)
    : v.tab === 'diff' ? diff(m, t, v, width, compact, limit, border)
    : v.tab === 'agents' ? agents(m, t, v, width, compact, now, limit, border)
    : plan(m, t, v, width, compact, limit, border)
  return { rows, body: n < 0 ? [0, rows.length] : [1, 1 + n] }
}

export const tabRows = (...a: Parameters<typeof tabParts>): Seg[][] => tabParts(...a).rows

// The pet's life is the tighter of the 5-hour and weekly windows. API-key sessions report no windows, so they
// show what the session has spent; context is the last resort because the CONTEXT box already shows it.
function lifeRow(m: Model, t: Theme, width: number, now: number, look?: Look): Seg[] {
  const c = t.colors
  const windows = [['five_hour', '5h limit'], ['seven_day', 'weekly limit']] as const
  const tight = windows.flatMap(([kind, what]) => {
    const w = liveLimit(m, kind, now)
    return w ? [{ used: Math.round(w.percentUsed), what }] : []
  }).sort((a, b) => b.used - a.used)[0]
  if (!tight && m.costUsd !== undefined) return [{ text: `$${m.costUsd.toFixed(2)}`, color: c.text }, { text: ' spent this session', color: c.dim }]
  const { used, what } = tight ?? { used: m.ctxPercent, what: 'context' }
  return look?.extras.hp ? hpBar(used, t, width, what) : [...hearts(used, t), { text: `  ${what} ${100 - used}% left`, color: c.dim }]
}

// meter: a renderer plugin's rows (glowup.meter), drawn in place of the life row.
export function statusRows(model: Model, base: Theme, width: number, now: number, look?: Look, meter?: Seg[][]): Seg[][] {
  const m = normalizeModel(model)
  const t = look?.theme ?? base, c = t.colors
  const live = m.agents.filter(a => a.state === 'running')
  const rows: Seg[][] = [
    [{ text: `${m.act.glyph} ${m.act.label}`, color: toneColor(t, m.act.tone), bold: true }, ...comboSegs(m.combo, look)],
    ...(meter ?? [lifeRow(m, t, width, now, look)]),
  ]
  if (live.length) rows.push([{ text: `◆ ${live.map(a => a.name).join(', ')} working`, color: c.agent }])
  return rows.map(r => fit(r, width))
}

// The pet node is the ready Client element register.tsx builds; the pane only places it.
// rows is the strip height, from stripRows: the sheet's height, plus headroom while an outfit is worn.
// meter and field come from a renderer plugin: rows for the status box, and a builder for the
// field's player given the rows left open between the tab and the status box.
export type PaneExtra = { look?: Look; pet?: { id: PetId; node: unknown; rows?: number }; bubble?: { text: string; mood: Moment }; friday?: boolean; minRows?: number; bodyRows?: number; onRange?: (last: number, win: number) => void; meter?: Seg[][]; field?: (rows: number) => unknown; tabs?: readonly TabId[] }
export const PET_STRIP_COLS = 46
const BUBBLE_ROOM = 16

const bubbleColor = (t: Theme, mood: Moment) => (mood === 'fail' ? t.colors.fail : mood === 'done' ? t.colors.pass : t.colors.accent)

// Width of the Box the pet's Client sits in on a docked pane: inside the pane's border and padding (2 + 4).
export const petStripCols = (paneWidth: number) => Math.max(0, Math.min(PET_STRIP_COLS, paneWidth - 6))

const BUBBLE_LINES = 2
const cellsOf = (s: string) => visibleLength([{ text: s, color: '' }])

// Text cells and rows a bubble has at this pane width: inside its border and padding,
// beside Clawd when the docked strip leaves room, above him otherwise, and one row in the drawer.
export function bubbleBox(paneWidth: number, compact: boolean): { cols: number; lines: number; beside: boolean } {
  if (compact) return { cols: Math.max(1, paneWidth - 2 - CLAWD_ROW.length - 1), lines: 1, beside: true }
  const width = paneWidth - 6, room = width - petStripCols(paneWidth)
  const beside = room >= BUBBLE_ROOM
  return { cols: Math.max(1, (beside ? room : width) - 4), lines: BUBBLE_LINES, beside }
}

function petStrip(els: { Box: any; Text: any }, t: Theme, extra: PaneExtra, paneWidth: number) {
  const { Box, Text } = els
  const width = paneWidth - 6
  const rows = extra.pet!.rows ?? PET_ROWS, cols = petStripCols(paneWidth)
  const room = width - cols
  const { beside, cols: textCols, lines } = bubbleBox(paneWidth, false)
  const say = extra.bubble
  const bubble = say && (
    <Box key="bubble" borderStyle="round" borderColor={bubbleColor(t, say.mood)} paddingX={1} alignSelf="flex-start" flexDirection="column">
      {wrapBubble(say.text, textCols, lines, cellsOf).map((l, i) => <Text key={'b' + i} color={t.colors.text} wrap="truncate">{l}</Text>)}
    </Box>
  )
  const sign = !say && extra.friday && <Box key="friday"><Text color={t.colors.accent} wrap="truncate">{"it's friday"}</Text></Box>
  return (
    <Box flexDirection="column" key="pet">
      {!beside && bubble}
      <Box flexDirection="row" height={rows}>
        <Box width={cols} height={rows}>{extra.pet!.node as any}</Box>
        {beside && <Box flexDirection="column" width={room}>{bubble || sign}</Box>}
      </Box>
      {!beside && !say && sign}
    </Box>
  )
}

function petLine(els: { Box: any; Text: any }, t: Theme, extra: PaneExtra, width: number) {
  const { Box, Text } = els
  const say = extra.bubble, text = say?.text ?? (extra.friday ? "it's friday" : '')
  const color = say ? bubbleColor(t, say.mood) : t.colors.accent
  return (
    <Box flexDirection="row" key="pet" height={1}>
      <Box width={CLAWD_ROW.length} height={1}>{extra.pet!.node as any}</Box>
      {text && <Text color={color} wrap="truncate">{' ' + (wrapBubble(text, Math.max(1, width - CLAWD_ROW.length - 1), 1, cellsOf)[0] ?? '')}</Text>}
    </Box>
  )
}

// Rows the docked status box takes: margin, border, status lines, and the pet strip with its bubble or sign.
function footerRows(m: Model, t: Theme, extra: PaneExtra | undefined, width: number, now: number): number {
  const status = statusRows(m, t, width - 2 - 4, now, extra?.look, extra?.meter).length
  let pet = 0
  if (extra?.pet) {
    const { beside, cols, lines } = bubbleBox(width, false)
    const say = extra.bubble ? wrapBubble(extra.bubble.text, cols, lines, cellsOf).length + 2 : 0
    pet = (extra.pet.rows ?? PET_ROWS) + (beside ? 0 : say || (extra.friday ? 1 : 0))
  }
  return 1 + 2 + status + pet
}

export function renderPane(els: { Box: any; Text: any; Button: any }, m: Model, base: Theme, v: PaneView, width: number, compact: boolean, now: number, onTab: (id: TabId) => void, extra?: PaneExtra) {
  const { Box, Text, Button } = els
  const look = extra?.look, t = look?.theme ?? base
  const inner = width - 2
  const shown = visibleTabs(extra?.tabs, v.tab)
  v = { ...v, tab: shown.tab }
  // the drawer shows a tab strip, the tab content and one pet row, all within COMPACT_ROWS
  let rowsLeft = compact && extra?.pet ? COMPACT_ROWS - 2 : COMPACT_ROWS
  if (compact && extra?.bodyRows) rowsLeft = Math.max(1, Math.min(rowsLeft, extra.bodyRows - 1 - (extra.pet ? 1 : 0)))
  let { rows, body } = tabParts(m, t, v, inner, compact, now, rowsLeft, look?.border ?? 'round')
  let hint: any = null, open = 0, last = 0, win = 0
  if (!compact && extra?.bodyRows) {
    // tab strip and its margin sit above, the footer below; the tab gets the rest and scrolls on its own
    const room = Math.max(2, extra.bodyRows - 2 - footerRows(m, t, extra, width, now))
    open = Math.max(0, room - rows.length)
    if (rows.length > room) {
      // box edges and what follows the first box stay put; only that box's body rows scroll
      const bodyRoom = room - 1 - (rows.length - (body[1] - body[0]))
      const [from, to] = bodyRoom >= 1 ? body : [0, rows.length]
      win = bodyRoom >= 1 ? bodyRoom : room - 1
      const top = Math.max(0, Math.min(v.offset ?? 0, to - from - win))
      last = to - from - win
      const below = last - top
      hint = (
        <Box key="scroll" flexDirection="row" gap={1}>
          {top > 0 && <Text key="up" color={t.colors.dim} wrap="truncate">{`↑ ${top} more`}</Text>}
          {below > 0 && <Text key="down" color={t.colors.dim} wrap="truncate">{`↓ ${below} more`}</Text>}
        </Box>
      )
      rows = [...rows.slice(0, from), ...rows.slice(from + top, from + top + win), ...rows.slice(to)]
    }
  }
  extra?.onRange?.(last, win)
  return (
    // minHeight, not height: a short tab still pushes the status box to the bottom of the body
    <Box flexDirection="column" width={width} minHeight={compact ? undefined : extra?.minRows}>
      <Box flexDirection="row" gap={1}>
        {shown.tabs.map(([id, label], i) => <Button key={'tab-' + id} label={label} hotkey={String(i + 1)} variant={v.tab === id ? 'primary' : undefined} dimColor={v.tab !== id} onPress={() => onTab(id)} />)}
      </Box>
      <Box flexDirection="column" flexGrow={1} marginTop={compact ? 0 : 1}>
        {rows.map((r, i) => renderSegs(els, r, 'r' + i))}
        {hint}
        {open > 0 && extra?.field?.(open)}
      </Box>
      {compact && extra?.pet && petLine(els, t, extra, inner)}
      {!compact && (
        <Box flexDirection="column" width={inner} borderStyle={look?.border ?? 'round'} borderColor={look?.borderColor ?? t.colors.faint} marginTop={1} paddingX={1}>
          {statusRows(m, t, inner - 4, now, look, extra?.meter).map((r, i) => renderSegs(els, r, 's' + i))}
          {extra?.pet && petStrip(els, t, extra, width)}
        </Box>
      )}
    </Box>
  )
}
