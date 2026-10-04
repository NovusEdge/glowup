import type { ContextCategoryKind } from 'claude-code'
import { normalizeModel, type Model, type PlanItem } from './model.ts'
import { capped, legendRows, sparkline, stackBar, tokensK } from './ctxchart.ts'
import { planOrder } from './tasks.ts'
import type { Theme } from './themes.ts'
import { shortPath } from './events.ts'
import type { Look } from './packs.ts'
import { wrapBubble, type Mood } from './bubbles.ts'
import { CLAWD_ROW, PET_ROWS, type PetId } from './pets.ts'
import { comboSegs, fit, hearts, hpBar, renderSegs, toneColor, visibleLength, type Seg } from './layout.tsx'

export type TabId = 'changes' | 'agents' | 'plan'
export type PaneView = { tab: TabId; offset?: number; categories?: { name: string; tokens: number; kind: ContextCategoryKind }[]; maxTokens?: number; reduced?: boolean }
export const TABS: [TabId, string][] = [['changes', 'Changes'], ['agents', 'Agents'], ['plan', 'Plan & context']]
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

function changes(m: Model, t: Theme, w: number, compact: boolean, limit: number): Seg[][] {
  const c = t.colors, edited = m.files.filter(f => f.how !== 'read')
  const add = edited.reduce((n, f) => n + f.add, 0), del = edited.reduce((n, f) => n + f.del, 0)
  const rows: Seg[][] = []
  if (!compact) rows.push(header('CHANGES', `${edited.length} files  +${add} −${del}`, w, t), [])
  const list = compact ? edited : m.files
  const body: Seg[][] = []
  if (!list.length) body.push([{ text: '  Nothing changed yet.', color: c.dim }])
  for (const f of list) {
    const name = shortPath(f.path) + (f.how === 'new' ? '  new' : '')
    const left: Seg[] = [{ text: '  ', color: c.text }, { text: f.how === 'read' ? '▸ ' : '✎ ', color: f.how === 'read' ? c.read : c.edit }, { text: name, color: f.how === 'read' ? c.dim : c.text }]
    const right: Seg[] = f.how === 'read' ? [{ text: 'read', color: c.dim }] : [{ text: `+${f.add}`, color: c.pass }, { text: ` −${f.del}`, color: c.fail }]
    body.push(spread(left, right, w, t))
  }
  return [...rows, ...(compact ? cap(body, t, w, 0, limit) : body)].map(r => fit(r, w))
}

function agents(m: Model, t: Theme, v: PaneView, w: number, compact: boolean, now: number, limit: number): Seg[][] {
  const c = t.colors, live = m.agents.filter(a => a.state === 'running').length
  const rows: Seg[][] = []
  if (!compact) rows.push(header('AGENTS', `${live} running · ${m.agents.length - live} done`, w, t), [])
  const body: Seg[][] = []
  if (!m.agents.length) body.push([{ text: '  No subagents this session.', color: c.dim }])
  for (const a of m.agents) {
    const running = a.state === 'running'
    const spin = v.reduced ? '◌' : SPIN[Math.floor(now / 90) % SPIN.length]!
    const mark: Seg = { text: running ? spin : '✓', color: running ? c.agent : c.pass }
    if (compact) { body.push(fit([{ text: ` ◆ ${a.name} `, color: c.agent, bold: true }, mark, { text: ' ' + (running ? a.now ?? a.task : a.task), color: running ? c.read : c.dim }], w)); continue }
    const when = `${secs((a.endedAt ?? now) - a.startedAt)} · ${k(a.tokens)} `
    body.push(spread([{ text: '◆ ' + a.name, color: c.agent, bold: true }], [{ text: when, color: c.dim }, mark], w, t))
    body.push(fit([{ text: '  ' + a.task, color: c.text }], w))
    if (running && a.now) body.push(fit([{ text: '  └ ', color: c.faint }, { text: a.now, color: c.read }], w))
    body.push([])
  }
  return [...rows, ...(compact ? cap(body, t, w, 0, limit) : body)]
}

const rule = (label: string, right: string, w: number, t: Theme): Seg[] => {
  const head = ` ${label} `, tail = right ? ` ${right}` : ''
  return fit([{ text: ' ', color: t.colors.text }, { text: label, color: t.colors.text, bold: true }, { text: ' ' + '─'.repeat(Math.max(1, w - head.length - tail.length - 1)), color: t.colors.faint }, { text: tail, color: t.colors.dim }], w)
}
const divider = (w: number, t: Theme): Seg[] => [{ text: w < 2 ? '─' : '├' + '─'.repeat(w - 2) + '┤', color: t.colors.faint }]

function planRow(p: PlanItem, t: Theme, w: number): Seg[] {
  const c = t.colors, on = p.status === 'in_progress', done = p.status === 'completed'
  const g = done ? '✓' : on ? '◉' : '○'
  return fit([{ text: `  ${g} `, color: done ? c.pass : on ? c.accent : c.dim }, { text: on && p.active ? p.active : p.title, color: done ? c.dim : c.text, bold: on }], w)
}

const PAD = '  over this session  '
function history(m: Model, w: number, t: Theme): Seg[] | undefined {
  if (!m.ctxHistory.length && !m.compactions) return undefined
  const c = t.colors, lead = w >= 52 ? PAD : '  '
  const peak = `  peak ${Math.max(m.ctxPeak, ...m.ctxHistory)}%`, comp = m.compactions ? ` · compacted ${m.compactions}×` : ''
  const room = (tail: string) => w - lead.length - tail.length
  const tail = room(peak + comp) >= 4 ? peak + comp : peak
  const n = Math.max(0, Math.min(m.ctxHistory.length, room(tail)))
  return fit([{ text: lead, color: c.dim }, { text: n ? sparkline(m.ctxHistory.slice(-n)) : '', color: c.accent }, { text: tail, color: c.dim }], w)
}

function plan(m: Model, t: Theme, v: PaneView, w: number, compact: boolean, limit: number): Seg[][] {
  const c = t.colors, done = m.plan.filter(p => p.status === 'completed').length
  const used = m.ctxPercent
  const { items: shown, hiddenDone } = planOrder(m.plan)
  const items: Seg[][] = shown.map(p => planRow(p, t, w))
  if (!m.plan.length) items.push([{ text: '  No task list yet.', color: c.dim }])
  const cats = v.categories ?? []
  if (compact) {
    const inner = Math.max(4, w - 12)
    const ctx = fit([{ text: ' ctx ▕', color: c.dim }, ...stackBar(cats, v.maxTokens, used, inner, t).segs, { text: `▏${String(used).padStart(4)}%`, color: c.text }], w)
    return [...cap(items, t, w, 1, limit), ctx]
  }
  if (hiddenDone) items.push(fit([{ text: `    +${hiddenDone} more done`, color: c.dim }], w))
  const rows: Seg[][] = [rule('PLAN', m.plan.length ? `${done}/${m.plan.length}` : '', w, t), ...items, divider(w, t)]
  const usedTokens = cats.some(x => x.kind === 'used') ? cats.filter(x => x.kind === 'used').reduce((n, x) => n + x.tokens, 0) : v.maxTokens ? used / 100 * v.maxTokens : undefined
  rows.push(rule('CONTEXT', v.maxTokens && usedTokens !== undefined ? `${used}% · ${tokensK(usedTokens)} / ${tokensK(v.maxTokens)}` : `${used}% used`, w, t))
  const stack = stackBar(cats, v.maxTokens, used, Math.max(1, w - 3), t)
  rows.push(capped(stack, t), ...legendRows(stack.slices, w, t))
  const hist = history(m, w, t)
  if (hist) rows.push([], hist)
  if (used >= 70) {
    const top = stack.slices[0]
    rows.push(fit([{ text: `  ! ${top && top.label !== 'used' ? `${top.label} is the biggest share` : `context ${used}% used`}`, color: c.edit }], w))
  }
  return rows.map(r => fit(r, w))
}

export function tabRows(model: Model, t: Theme, v: PaneView, width: number, compact: boolean, now: number, limit = COMPACT_ROWS): Seg[][] {
  const m = normalizeModel(model)
  return v.tab === 'changes' ? changes(m, t, width, compact, limit) : v.tab === 'agents' ? agents(m, t, v, width, compact, now, limit) : plan(m, t, v, width, compact, limit)
}

export function statusRows(model: Model, base: Theme, width: number, look?: Look): Seg[][] {
  const m = normalizeModel(model)
  const t = look?.theme ?? base, c = t.colors
  const live = m.agents.filter(a => a.state === 'running')
  const rows: Seg[][] = [
    [{ text: `${m.act.glyph} ${m.act.label}`, color: toneColor(t, m.act.tone), bold: true }, ...comboSegs(m.combo, look)],
    look?.extras.hp ? hpBar(m.ctxPercent, t, width) : [...hearts(m.ctxPercent, t), { text: `  context ${100 - m.ctxPercent}% left`, color: c.dim }],
  ]
  if (live.length) rows.push([{ text: `◆ ${live.map(a => a.name).join(', ')} working`, color: c.agent }])
  return rows.map(r => fit(r, width))
}

// The pet node is the ready Client element register.tsx builds; the pane only places it.
// rows is the strip height: PET_ROWS, or two more while an outfit needs headroom.
export type PaneExtra = { look?: Look; pet?: { id: PetId; node: unknown; rows?: number }; bubble?: { text: string; mood: Mood }; friday?: boolean; minRows?: number; bodyRows?: number; onScroll?: (offset: number) => void }
export const PET_STRIP_COLS = 46
const BUBBLE_ROOM = 16

const bubbleColor = (t: Theme, mood: Mood) => (mood === 'fail' ? t.colors.fail : mood === 'done' ? t.colors.pass : t.colors.accent)

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
function footerRows(m: Model, t: Theme, extra: PaneExtra | undefined, width: number): number {
  const status = statusRows(m, t, width - 2 - 4, extra?.look).length
  let pet = 0
  if (extra?.pet) {
    const { beside, cols, lines } = bubbleBox(width, false)
    const say = extra.bubble ? wrapBubble(extra.bubble.text, cols, lines, cellsOf).length + 2 : 0
    pet = (extra.pet.rows ?? PET_ROWS) + (beside ? 0 : say || (extra.friday ? 1 : 0))
  }
  return 1 + 2 + status + pet
}

export function renderPane(els: { Box: any; Text: any; Button: any }, m: Model, base: Theme, v: PaneView, width: number, compact: boolean, now: number, onTab: (id: TabId) => void, extra?: PaneExtra) {
  const { Box, Button } = els
  const look = extra?.look, t = look?.theme ?? base
  const inner = width - 2
  // the drawer shows a tab strip, the tab content and one pet row, all within COMPACT_ROWS
  let rowsLeft = compact && extra?.pet ? COMPACT_ROWS - 2 : COMPACT_ROWS
  if (compact && extra?.bodyRows) rowsLeft = Math.max(1, Math.min(rowsLeft, extra.bodyRows - 1 - (extra.pet ? 1 : 0)))
  let rows = tabRows(m, t, v, inner, compact, now, rowsLeft)
  let hint: any = null
  if (!compact && extra?.bodyRows) {
    // tab strip and its margin sit above, the footer below; the tab gets the rest and scrolls on its own
    const room = Math.max(2, extra.bodyRows - 2 - footerRows(m, t, extra, width))
    if (rows.length > room) {
      const win = room - 1, last = rows.length - win, top = Math.max(0, Math.min(v.offset ?? 0, last)), below = last - top
      const go = (to: number) => extra.onScroll?.(Math.max(0, Math.min(to, last)))
      hint = (
        <Box key="scroll" flexDirection="row" gap={1}>
          {top > 0 && <Button key="up" label={`↑ ${top} more`} hotkey="k" dimColor onPress={() => go(top - win)} />}
          {below > 0 && <Button key="down" label={`↓ ${below} more`} hotkey="j" dimColor onPress={() => go(top + win)} />}
        </Box>
      )
      rows = rows.slice(top, top + win)
    }
  }
  return (
    // minHeight, not height: a short tab still pushes the status box to the bottom of the body
    <Box flexDirection="column" width={width} minHeight={compact ? undefined : extra?.minRows}>
      <Box flexDirection="row" gap={1}>
        {TABS.map(([id, label], i) => <Button key={'tab-' + id} label={label} hotkey={String(i + 1)} variant={v.tab === id ? 'primary' : undefined} dimColor={v.tab !== id} onPress={() => onTab(id)} />)}
      </Box>
      <Box flexDirection="column" flexGrow={1} marginTop={compact ? 0 : 1}>
        {rows.map((r, i) => renderSegs(els, r, 'r' + i))}
        {hint}
      </Box>
      {compact && extra?.pet && petLine(els, t, extra, inner)}
      {!compact && (
        <Box flexDirection="column" borderStyle={look?.border ?? 'round'} borderColor={look?.borderColor ?? t.colors.faint} marginTop={1} paddingX={1}>
          {statusRows(m, t, inner - 4, look).map((r, i) => renderSegs(els, r, 's' + i))}
          {extra?.pet && petStrip(els, t, extra, width)}
        </Box>
      )}
    </Box>
  )
}
