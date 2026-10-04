import type { ContextCategoryKind } from 'claude-code'
import type { Model } from './model.ts'
import type { Theme } from './themes.ts'
import { shortPath } from './events.ts'
import { bar, ctxColor, fit, hearts, renderSegs, toneColor, visibleLength, type Seg } from './layout.tsx'

export type TabId = 'changes' | 'agents' | 'plan'
export type PaneView = { tab: TabId; categories?: { name: string; tokens: number; kind: ContextCategoryKind }[]; maxTokens?: number; reduced?: boolean }
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
const cap = (rows: Seg[][], t: Theme, w: number, reserve = 0): Seg[][] => {
  const room = COMPACT_ROWS - reserve
  if (rows.length <= room) return rows
  return [...rows.slice(0, room - 1), fit([{ text: `  … ${rows.length - room + 1} more`, color: t.colors.dim }], w)]
}

function changes(m: Model, t: Theme, w: number, compact: boolean): Seg[][] {
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
  return [...rows, ...(compact ? cap(body, t, w) : body)].map(r => fit(r, w))
}

function agents(m: Model, t: Theme, v: PaneView, w: number, compact: boolean, now: number): Seg[][] {
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
  return [...rows, ...(compact ? cap(body, t, w) : body)]
}

function plan(m: Model, t: Theme, v: PaneView, w: number, compact: boolean): Seg[][] {
  const c = t.colors, done = m.plan.filter(p => p.status === 'completed').length
  const used = m.ctxPercent, col = ctxColor(used, t)
  const rows: Seg[][] = []
  if (!compact) rows.push(header('PLAN', m.plan.length ? `${done}/${m.plan.length}` : '', w, t), [])
  const items: Seg[][] = []
  if (!m.plan.length) items.push([{ text: '  No task list yet.', color: c.dim }])
  for (const p of m.plan) {
    const g = p.status === 'completed' ? '✓' : p.status === 'in_progress' ? '◉' : '○'
    const gc = p.status === 'completed' ? c.pass : p.status === 'in_progress' ? c.accent : c.dim
    items.push(fit([{ text: `  ${g} `, color: gc }, { text: p.title, color: p.status === 'completed' ? c.dim : c.text, bold: p.status === 'in_progress' }], w))
  }
  if (compact) {
    const ctx = fit([{ text: ' ctx ', color: c.dim }, ...bar(used / 100, Math.max(4, w - 11), col, t), { text: ` ${String(used).padStart(3)}%`, color: c.text }], w)
    return [...cap(items, t, w, 1), ctx]
  }
  rows.push(...items, [], header('CONTEXT', `${used}% used`, w, t), [{ text: '  ', color: c.text }, ...bar(used / 100, Math.max(1, w - 4), col, t)], [])
  const usedCats = (v.categories ?? []).filter(x => x.kind === 'used' && x.tokens > 0).sort((a, b) => b.tokens - a.tokens)
  if (usedCats.length && v.maxTokens) {
    const lw = 16, bw = Math.max(4, w - lw - 9)
    for (const cat of usedCats.slice(0, 6)) {
      const pct = Math.round((cat.tokens / v.maxTokens) * 100)
      const name = fit([{ text: cat.name, color: c.dim }], lw - 1)
      rows.push(fit([{ text: '  ', color: c.dim }, ...name, { text: ' '.repeat(lw - visibleLength(name)), color: c.dim }, ...bar(pct / 100, bw, col, t), { text: ` ${String(pct).padStart(3)}%`, color: c.text }], w))
    }
  }
  if (used >= 70) rows.push([], fit([{ text: `  ! ${usedCats[0] && v.maxTokens ? `${usedCats[0].name} is the biggest share` : `context ${used}% used`}`, color: c.edit }], w))
  return rows.map(r => fit(r, w))
}

export function tabRows(m: Model, t: Theme, v: PaneView, width: number, compact: boolean, now: number): Seg[][] {
  return v.tab === 'changes' ? changes(m, t, width, compact) : v.tab === 'agents' ? agents(m, t, v, width, compact, now) : plan(m, t, v, width, compact)
}

export function statusRows(m: Model, t: Theme, width: number): Seg[][] {
  const c = t.colors
  const live = m.agents.filter(a => a.state === 'running')
  const rows: Seg[][] = [
    [{ text: `${m.act.glyph} ${m.act.label}`, color: toneColor(t, m.act.tone), bold: true }],
    [...hearts(m.ctxPercent, t), { text: `  context ${100 - m.ctxPercent}% left`, color: c.dim }],
  ]
  if (live.length) rows.push([{ text: `◆ ${live.map(a => a.name).join(', ')} working`, color: c.agent }])
  return rows.map(r => fit(r, width))
}

export function renderPane(els: { Box: any; Text: any; Button: any }, m: Model, t: Theme, v: PaneView, width: number, compact: boolean, now: number, onTab: (id: TabId) => void) {
  const { Box, Button } = els
  const inner = width - 2
  return (
    <Box flexDirection="column" width={width}>
      <Box flexDirection="row" gap={1}>
        {TABS.map(([id, label], i) => <Button key={'tab-' + id} label={label} hotkey={String(i + 1)} variant={v.tab === id ? 'primary' : undefined} dimColor={v.tab !== id} onPress={() => onTab(id)} />)}
      </Box>
      <Box flexDirection="column" flexGrow={1} marginTop={compact ? 0 : 1}>
        {tabRows(m, t, v, inner, compact, now).map((r, i) => renderSegs(els, r, 'r' + i))}
      </Box>
      {!compact && (
        <Box flexDirection="column" borderStyle="round" borderColor={t.colors.faint} marginTop={1} paddingX={1}>
          {statusRows(m, t, inner - 4).map((r, i) => renderSegs(els, r, 's' + i))}
        </Box>
      )}
    </Box>
  )
}
