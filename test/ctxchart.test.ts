import { test, expect } from 'claude-code/testing'
import { tabRows, COMPACT_ROWS } from '../hooks/pane.tsx'
import { stackBar, legendRows, shortName, tokensK, sparkline } from '../hooks/ctxchart.ts'
import { visibleLength, type Seg } from '../hooks/layout.tsx'
import { initialModel, type Model, type PlanItem } from '../hooks/model.ts'
import { resolveTheme, PRESETS } from '../hooks/themes.ts'

const T = resolveTheme('classic', {}).theme
const text = (rows: Seg[][]) => rows.map(r => r.map(s => s.text).join(''))
const cat = (name: string, tokens: number) => ({ name, tokens, kind: 'used' as const })
const CATS = [cat('Messages', 62000), cat('System tools', 36000), cat('System prompt', 18000), cat('Memory files', 8000), cat('Skills', 2000)]
const MAX = 200000
const plan = (n: number, status: PlanItem['status'], from = 0): PlanItem[] => Array.from({ length: n }, (_, i) => ({ id: String(from + i + 1), title: `${status} ${from + i + 1}`, status }))
const base = (extra: Partial<Model> = {}): Model => ({ ...initialModel(), ctxPercent: 62, ...extra })
const view = { tab: 'plan' as const, categories: CATS, maxTokens: MAX }
const cells = (s: Seg[]) => s.reduce((n, x) => n + [...x.text].length, 0)

test('stacked bar segments fill the width exactly and match the percentages', async () => {
  for (const w of [10, 24, 37, 57, 87]) {
    const { segs, slices } = stackBar(CATS, MAX, 62, w, T)
    expect(cells(segs), `width ${w}`).toBe(w)
    for (const s of slices) expect(Math.abs(s.cells - (s.pct / 100) * w), `${s.label} at ${w}`).toBeLessThanOrEqual(1.5)
    const free = segs.filter(s => s.text.startsWith('·')).reduce((n, s) => n + s.text.length, 0)
    expect(Math.abs(free - (1 - 126000 / MAX) * w)).toBeLessThanOrEqual(1.5)
  }
})

test('every category gets its own theme-derived color, biggest first, and free space is faint dots', async () => {
  for (const name of Object.keys(PRESETS)) {
    const t = resolveTheme(name, {}).theme
    const { segs, slices } = stackBar(CATS, MAX, 62, 60, t)
    const colors = slices.map(s => s.color)
    expect(new Set(colors).size, name).toBe(colors.length)
    expect(slices.map(s => s.label)).toEqual(['messages', 'tools', 'system', 'memory', 'skills'])
    expect(colors[0], name).toBe(t.colors.read)
    expect(segs.at(-1)).toMatchObject({ color: t.colors.faint })
    expect(segs.at(-1)!.text).toMatch(/^·+$/)
  }
})

test('without usable colors the segments fall back to block shades', async () => {
  const mono = { ...T, colors: { ...T.colors, read: 'default', agent: 'default', shell: 'default', edit: 'default', accent: 'default' } }
  const { segs, slices } = stackBar(CATS, MAX, 62, 60, mono)
  expect(slices.map(s => s.glyph)).toEqual(['█', '▓', '▒', '░', '█'])
  expect(segs.some(s => s.text.includes('▓'))).toBe(true)
})

test('more than six categories fold into other; no categories draws one used segment', async () => {
  const many = Array.from({ length: 9 }, (_, i) => cat('Thing ' + i, 9000 - i * 100))
  const { slices, segs } = stackBar(many, MAX, 40, 50, T)
  expect(slices).toHaveLength(6)
  expect(slices.at(-1)!.label).toBe('other')
  expect(cells(segs)).toBe(50)
  const plain = stackBar([], undefined, 30, 40, T)
  expect(plain.slices.map(s => [s.label, s.cells])).toEqual([['used', 12]])
  expect(cells(plain.segs)).toBe(40)
})

test('names are short and tokens are in k', async () => {
  expect(['System prompt', 'System tools', 'Memory files', 'Messages', 'MCP tools', 'Custom agents', 'Skills'].map(shortName)).toEqual(['system', 'tools', 'memory', 'messages', 'mcp', 'agents', 'skills'])
  expect([124000, 200000, 900, 1500000].map(tokensK)).toEqual(['124k', '200k', '900', '1.5M'])
})

test('the legend wraps onto more rows when narrow and every row fits', async () => {
  const { slices } = stackBar(CATS, MAX, 62, 50, T)
  const wide = legendRows(slices, 90, T), narrow = legendRows(slices, 30, T)
  expect(wide).toHaveLength(1)
  expect(narrow.length).toBeGreaterThan(1)
  for (const r of narrow) expect(visibleLength(r)).toBeLessThanOrEqual(30)
  expect(text(narrow).join(' ')).toContain('messages 31%')
})

test('the tab has a header rule, a real divider and a context header with tokens', async () => {
  const m = base({ plan: [...plan(5, 'completed'), ...plan(1, 'in_progress', 5), ...plan(1, 'pending', 6)] })
  for (const w of [40, 60, 90]) {
    const rows = text(tabRows(m, T, view, w, false, 0))
    expect(rows[0]).toMatch(/^ PLAN ─+ 5\/7$/)
    expect(rows.find(r => r.startsWith('├'))).toBe('├' + '─'.repeat(w - 2) + '┤')
    expect(rows.find(r => r.startsWith(' CONTEXT'))).toMatch(/ ─+ 62% · 126k \/ 200k$/)
    for (const r of rows) expect(visibleLength([{ text: r, color: '' }])).toBeLessThanOrEqual(w)
  }
})

test('plan rows: active first, then pending, then the last three done and a count of the rest', async () => {
  const m = base({ plan: [...plan(12, 'completed'), { id: '13', title: 'Writing speech', status: 'in_progress', active: 'Writing the speech' }, ...plan(2, 'pending', 13)] })
  const rows = text(tabRows(m, T, view, 60, false, 0))
  expect(rows.slice(1, 8)).toEqual(['  ◉ Writing the speech', '  ○ pending 14', '  ○ pending 15', '  ✓ completed 10', '  ✓ completed 11', '  ✓ completed 12', '    +9 more done'])
  expect(rows[0]).toMatch(/12\/15$/)
})

test('the sparkline is bounded by the width and counts compactions and the peak', async () => {
  const hist = Array.from({ length: 100 }, (_, i) => i % 100)
  for (const w of [30, 40, 60, 90]) {
    const rows = text(tabRows(base({ ctxHistory: hist, ctxPeak: 99, compactions: 2 }), T, view, w, false, 0))
    const line = rows.find(r => r.includes('peak'))!
    expect(visibleLength([{ text: line, color: '' }])).toBeLessThanOrEqual(w)
    expect([...line].filter(c => '▁▂▃▄▅▆▇█'.includes(c)).length).toBeLessThan(w)
    expect(line).toContain('peak 99%')
  }
  const wide = text(tabRows(base({ ctxHistory: [10, 40, 64], ctxPeak: 64, compactions: 1 }), T, view, 90, false, 0)).find(r => r.includes('over this session'))!
  expect(wide).toBe('  over this session  ▁▄▆  peak 64% · compacted 1×')
  expect(sparkline([0, 50, 100])).toBe('▁▅█')
  expect(text(tabRows(base(), T, view, 60, false, 0)).some(r => r.includes('over this session'))).toBe(false)
})

test('the warning appears from 70% only', async () => {
  const rows = (p: number) => text(tabRows(base({ ctxPercent: p }), T, view, 60, false, 0))
  expect(rows(70).some(r => r.includes('! messages is the biggest share'))).toBe(true)
  expect(rows(69).some(r => r.includes('!'))).toBe(false)
})

test('compact drawer keeps its row budget and shows one stacked bar with the percent', async () => {
  for (const n of [0, 3, 20]) {
    const m = base({ plan: [...plan(n, 'pending'), ...plan(n, 'completed', 100)], ctxHistory: [10, 20], compactions: 1 })
    for (const w of [20, 40, 58]) {
      const rows = text(tabRows(m, T, view, w, true, 0))
      expect(rows.length).toBeLessThanOrEqual(COMPACT_ROWS)
      expect(rows.at(-1)).toMatch(/ctx ▕.*▏ +62%$/)
      for (const r of rows) expect(visibleLength([{ text: r, color: '' }])).toBeLessThanOrEqual(w)
    }
  }
})

test('bar colors come from the theme: another theme gives other segment colors', async () => {
  const other = resolveTheme(Object.keys(PRESETS).find(n => n !== 'classic')!, {}).theme
  const a = stackBar(CATS, MAX, 62, 40, T).slices.map(s => s.color), b = stackBar(CATS, MAX, 62, 40, other).slices.map(s => s.color)
  expect(a[0]).toBe(T.colors.read)
  expect(b[0]).toBe(other.colors.read)
  expect(a).not.toEqual(b)
})
