import { test, expect } from 'claude-code/testing'
import { tabRows, statusRows, renderPane, type TabId } from '../hooks/pane.tsx'
import { visibleLength } from '../hooks/layout.tsx'
import { initialModel, type Model } from '../hooks/model.ts'
import { resolveTheme } from '../hooks/themes.ts'

const T = resolveTheme('classic', {}).theme
const text = (rows: { text: string }[][]) => rows.map(r => r.map(s => s.text).join(''))
const M: Model = {
  ...initialModel(), working: true, ctxPercent: 64,
  act: { glyph: '✎', label: 'Editing src/auth.ts', tone: 'edit' },
  files: [
    { path: '/r/src/safe-next.ts', add: 10, del: 1, how: 'new', at: 3 },
    { path: '/r/src/auth.ts', add: 2, del: 1, how: 'edit', at: 2 },
    { path: '/r/test/auth.test.ts', add: 0, del: 0, how: 'read', at: 1 },
    { path: '/r/src/日本語のとても長いファイル名.ts', add: 5, del: 5, how: 'edit', at: 0 },
  ],
  agents: [
    { key: 'a', name: 'scout', task: 'Find the redirect tests', state: 'done', startedAt: 0, endedAt: 9000, tokens: 4100 },
    { key: 'b', name: 'scout 2', task: 'Check other callers', state: 'running', startedAt: 5000, now: '▸ Reading src/nav.tsx' },
  ],
  plan: [{ id: '1', title: 'Find it', status: 'completed' }, { id: '2', title: 'Patch it', status: 'in_progress' }, { id: '3', title: 'Push', status: 'pending' }],
}
const many = (n: number): Model => ({
  ...M,
  files: Array.from({ length: n }, (_, i) => ({ path: `/r/src/f${i}.ts`, add: 1, del: 0, how: 'edit' as const, at: i })),
  agents: Array.from({ length: n }, (_, i) => ({ key: 'k' + i, name: 'a' + i, task: 't', state: 'running' as const, startedAt: 0 })),
  plan: Array.from({ length: n }, (_, i) => ({ id: String(i), title: 'step ' + i, status: 'pending' as const })),
})

test('changes tab lists edited files with counts and reads dimmed', async () => {
  const rows = text(tabRows(M, T, { tab: 'changes' }, 54, false, 10000))
  expect(rows[0]).toMatch(/^CHANGES\s+3 files  \+17 −7$/)
  expect(rows.some(r => r.includes('src/safe-next.ts') && r.includes('new') && r.includes('+10 −1'))).toBe(true)
  expect(rows.some(r => r.includes('test/auth.test.ts') && r.endsWith('read'))).toBe(true)
})

test('agents tab shows status, time, tokens and current tool', async () => {
  const rows = text(tabRows(M, T, { tab: 'agents' }, 54, false, 12000))
  expect(rows[0]).toMatch(/^AGENTS\s+1 running · 1 done$/)
  expect(rows.some(r => r.includes('scout') && r.includes('9s · 4.1k') && r.endsWith('✓'))).toBe(true)
  expect(rows.some(r => r.includes('└ ▸ Reading src/nav.tsx'))).toBe(true)
})

test('plan tab shows checklist, context bar and breakdown', async () => {
  const rows = text(tabRows(M, T, { tab: 'plan', categories: [{ name: 'Messages', tokens: 60000, kind: 'used' }, { name: 'System tools', tokens: 20000, kind: 'used' }], maxTokens: 200000 }, 54, false, 0))
  expect(rows[0]).toMatch(/^PLAN\s+1\/3$/)
  expect(rows).toContain('  ✓ Find it')
  expect(rows).toContain('  ◉ Patch it')
  expect(rows.some(r => r.startsWith('CONTEXT') && r.endsWith('64% used'))).toBe(true)
  expect(rows.some(r => r.includes('Messages') && r.includes('30%'))).toBe(true)
})

test('every row fits its width in cells, full and compact, CJK names included', async () => {
  for (const tab of ['changes', 'agents', 'plan'] as const)
    for (const [w, compact] of [[54, false], [40, false], [58, true], [30, true], [20, true]] as const)
      for (const r of tabRows(M, T, { tab, categories: [{ name: 'メッセージ', tokens: 5, kind: 'used' }], maxTokens: 10 }, w, compact, 12000)) expect(visibleLength(r)).toBeLessThanOrEqual(w)
})

const planView = (ctxPercent: number, categories?: { name: string; tokens: number; kind: 'used' | 'free' | 'buffer' | 'deferred' }[]) =>
  text(tabRows({ ...M, ctxPercent }, T, { tab: 'plan', categories, maxTokens: 200000 }, 54, false, 0))
const CATS = [
  { name: 'Free space', tokens: 90000, kind: 'free' as const },
  { name: 'Autocompact buffer', tokens: 40000, kind: 'buffer' as const },
  { name: 'Skills', tokens: 10000, kind: 'used' as const },
  { name: 'Messages', tokens: 50000, kind: 'used' as const },
]

test('context breakdown draws only used categories, biggest first', async () => {
  const rows = planView(50, CATS)
  expect(rows.some(r => r.includes('Free space') || r.includes('Autocompact'))).toBe(false)
  const at = (n: string) => rows.findIndex(r => r.includes(n))
  expect(at('Messages')).toBeGreaterThan(-1)
  expect(at('Messages')).toBeLessThan(at('Skills'))
})

test('context warning names the biggest used category, falls back to the percent, and is absent below 70', async () => {
  const withCats = planView(75, CATS)
  expect(withCats).toContain('  ! Messages is the biggest share')
  expect(withCats.join('\n')).not.toContain('Free space')
  expect(planView(75)).toContain('  ! context 75% used')
  expect(planView(75, [{ name: 'Free space', tokens: 9, kind: 'free' }])).toContain('  ! context 75% used')
  expect(planView(69, CATS).some(r => r.includes('!'))).toBe(false)
})

test('compact changes is one row per edited file', async () => {
  const rows = text(tabRows(M, T, { tab: 'changes' }, 58, true, 0))
  expect(rows.filter(r => r.includes('✎'))).toHaveLength(3)
})

test('compact drawer is at most 6 rows and ends with a count of the rest', async () => {
  for (const tab of ['changes', 'agents', 'plan'] as const) {
    const rows = text(tabRows(many(20), T, { tab }, 58, true, 0))
    expect(rows.length).toBeLessThanOrEqual(6)
    expect(rows.some(r => /… \d+ more$/.test(r))).toBe(true)
  }
  const six = text(tabRows(many(6), T, { tab: 'changes' }, 58, true, 0))
  expect(six).toHaveLength(6)
  expect(six.some(r => r.includes('more'))).toBe(false)
  expect(text(tabRows(many(8), T, { tab: 'changes' }, 58, true, 0))[5]).toBe('  … 3 more')
  // the context bar stays visible under a long plan
  expect(text(tabRows(many(20), T, { tab: 'plan' }, 58, true, 0)).at(-1)).toContain('ctx')
})

test('running agents spin, or show a still ◌ when motion is reduced', async () => {
  const agentRows = (reduced?: boolean) => text(tabRows(M, T, { tab: 'agents', reduced }, 54, false, 90)).join('\n')
  expect(agentRows()).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/)
  expect(agentRows(true)).toContain('◌')
  expect(agentRows(true)).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/)
  expect(text(tabRows(M, T, { tab: 'agents', reduced: true }, 58, true, 90)).join('\n')).toContain('◌')
})

test('empty states', async () => {
  const empty = initialModel()
  expect(text(tabRows(empty, T, { tab: 'changes' }, 54, false, 0)).join('\n')).toContain('Nothing changed yet')
  expect(text(tabRows(empty, T, { tab: 'agents' }, 54, false, 0)).join('\n')).toContain('No subagents this session')
  expect(text(tabRows(empty, T, { tab: 'plan' }, 54, false, 0)).join('\n')).toContain('No task list yet')
})

test('status rows say the action and context in words', async () => {
  const rows = text(statusRows(M, T, 54))
  expect(rows[0]).toBe('✎ Editing src/auth.ts')
  expect(rows[1]).toBe('♥♥♡♡♡  context 36% left')
  expect(rows[2]).toBe('◆ scout 2 working')
})

// Fake element table: lets renderPane run without the engine.
const els = { Box: 'Box', Text: 'Text', Button: 'Button' }
const walk = (n: any, out: any[] = []): any[] => {
  if (n && typeof n === 'object') {
    out.push(n)
    for (const c of n.children ?? []) walk(c, out)
  }
  return out
}

test('renderPane draws three tab buttons with hotkeys 1-3 and presses switch tab', async () => {
  const picked: TabId[] = []
  const tree = renderPane(els, M, T, { tab: 'agents' }, 54, false, 0, id => picked.push(id))
  const buttons = walk(tree).filter(n => n.type === 'Button')
  expect(buttons.map(b => [b.props.key, b.props.hotkey])).toEqual([['tab-changes', '1'], ['tab-agents', '2'], ['tab-plan', '3']])
  expect(buttons.map(b => b.props.variant)).toEqual([undefined, 'primary', undefined])
  buttons[2].onPress({})
  expect(picked).toEqual(['plan'])
})

test('renderPane drops the status section when compact', async () => {
  const bordered = (compact: boolean) => walk(renderPane(els, M, T, { tab: 'plan' }, 58, compact, 0, () => {})).some(n => n.props?.borderStyle)
  expect(bordered(false)).toBe(true)
  expect(bordered(true)).toBe(false)
})
