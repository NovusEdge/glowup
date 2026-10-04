import { test, expect } from 'claude-code/testing'
import { tabRows, statusRows, renderPane, COMPACT_ROWS, petStripCols, bubbleBox, type TabId } from '../hooks/pane.tsx'
import { CLAWD_SAY } from '../hooks/bubbles.ts'
import { resolveLook } from '../hooks/packs.ts'
import { visibleLength } from '../hooks/layout.tsx'
import { initialModel, applyEvent, type Model } from '../hooks/model.ts'
import { resolveTheme } from '../hooks/themes.ts'

const T = resolveTheme('classic', {}).theme
const text = (rows: { text: string }[][]) => rows.map(r => r.map(s => s.text).join(''))
const M: Model = {
  ...initialModel(), working: true, ctxPercent: 64,
  act: { glyph: '✎', label: 'Editing src/auth.ts', tone: 'edit' },
  files: [
    { path: '/r/src/safe-next.ts', add: 10, del: 1, how: 'new', at: 3 },
    { path: '/r/src/auth.ts', add: 2, del: 1, how: 'edit', at: 2 },
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

test('changes tab lists edited files with counts', async () => {
  const rows = text(tabRows(M, T, { tab: 'changes' }, 54, false, 10000))
  expect(rows[0]).toMatch(/^CHANGES\s+3 files  \+17 −7$/)
  expect(rows.some(r => r.includes('src/safe-next.ts') && r.includes('new') && r.includes('+10 −1'))).toBe(true)
})

test('a file Claude only read stays out of the changes tab, and the tab then says nothing changed', async () => {
  let m = applyEvent(initialModel(), { type: 'tool-end', at: 1, tool: 'Read', toolUseId: 'r', input: { file_path: '/r/test/auth.test.ts' }, isError: false, text: '' })
  for (const compact of [false, true]) {
    const rows = text(tabRows(m, T, { tab: 'changes' }, 54, compact, 10000))
    if (!compact) expect(rows[0]).toMatch(/^CHANGES\s+0 files  \+0 −0$/)
    expect(rows.some(r => r.includes('Nothing changed yet.'))).toBe(true)
    expect(rows.some(r => r.includes('auth.test.ts'))).toBe(false)
  }
  m = applyEvent(m, { type: 'tool-end', at: 2, tool: 'Edit', toolUseId: 'e', input: { file_path: '/r/test/auth.test.ts', old_string: 'a', new_string: 'b' }, isError: false, text: '' })
  expect(text(tabRows(m, T, { tab: 'changes' }, 54, false, 10000)).some(r => r.includes('auth.test.ts'))).toBe(true)
})

test('agents tab shows status, time, tokens and current tool', async () => {
  const rows = text(tabRows(M, T, { tab: 'agents' }, 54, false, 12000))
  expect(rows[0]).toMatch(/^AGENTS\s+1 running · 1 done$/)
  expect(rows.some(r => r.includes('scout') && r.includes('9s · 4.1k') && r.endsWith('✓'))).toBe(true)
  expect(rows.some(r => r.includes('└ ▸ Reading src/nav.tsx'))).toBe(true)
})

test('plan tab shows checklist, context bar and breakdown', async () => {
  const rows = text(tabRows(M, T, { tab: 'plan', categories: [{ name: 'Messages', tokens: 60000, kind: 'used' }, { name: 'System tools', tokens: 20000, kind: 'used' }], maxTokens: 200000 }, 54, false, 0))
  expect(rows[0]).toMatch(/^ PLAN ─+ 1\/3$/)
  expect(rows).toContain('  ✓ Find it')
  expect(rows).toContain('  ◉ Patch it')
  expect(rows.some(r => r.startsWith(' CONTEXT') && r.endsWith('64% · 80k / 200k'))).toBe(true)
  expect(rows.some(r => r.includes('messages 30%') && r.includes('tools 10%'))).toBe(true)
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
  const legend = rows.find(r => r.includes('messages'))!
  expect(legend.indexOf('messages')).toBeLessThan(legend.indexOf('skills'))
})

test('context warning names the biggest used category, falls back to the percent, and is absent below 70', async () => {
  const withCats = planView(75, CATS)
  expect(withCats).toContain('  ! messages is the biggest share')
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
  const rows = text(statusRows(M, T, 54, 0))
  expect(rows[0]).toBe('✎ Editing src/auth.ts')
  expect(rows[1]).toBe('♥♥♡♡♡  context 36% left')
  expect(rows[2]).toBe('◆ scout 2 working')
})

test('the life row shows the tighter usage window, then spend, then context', async () => {
  const life = (m: Partial<Model>, now = 0) => text(statusRows({ ...M, ...m }, T, 54, now))[1]
  const limits = [{ kind: 'five_hour', percentUsed: 30, resetsAt: '1970-01-01T05:00:00Z' }, { kind: 'seven_day', percentUsed: 62.4 }]
  expect(life({ limits, costUsd: 4.2 })).toBe('♥♥♡♡♡  weekly limit 38% left')
  expect(life({ limits: [{ ...limits[0]!, percentUsed: 90 }, limits[1]!] })).toBe('♥♡♡♡♡  5h limit 10% left')
  // a window past its reset no longer counts; with neither left, an API-key session shows spend
  expect(life({ limits: [limits[0]!], costUsd: 4.2 }, Date.parse('1970-01-01T06:00:00Z'))).toBe('$4.20 spent this session')
  expect(life({ costUsd: 0.5 })).toBe('$0.50 spent this session')
})

// Fake element table: lets renderPane run without the engine.
const els = { Box: 'Box', Text: 'Text', Button: 'Button' }
const walk = (n: any, out: any[] = []): any[] => {
  if (typeof n === 'string') out.push(n)
  else if (n && typeof n === 'object') {
    out.push(n)
    for (const c of n.children ?? []) walk(c, out)
  }
  return out
}
// the text of every row Box (a Box whose children are Text)
const textRows = (tree: any): string[] =>
  walk(tree).filter(n => n?.type === 'Box' && (n.children ?? []).some((c: any) => c?.type === 'Text')).map(n => walk(n).filter(x => typeof x === 'string').join(''))

const PETNODE = { type: 'Client', props: { key: 'pet', module: './client/pet.tsx' } }
const arcade = resolveLook({ colors: 'arcade', motion: 'arcade' }, {}, {}).look

test('docked pane: the pet strip sits at the bottom, inside the pack border', async () => {
  const tree = renderPane(els, M, T, { tab: 'changes' }, 54, false, 0, () => {}, { look: arcade, pet: { id: 'clawd', node: PETNODE } })
  const box = walk(tree).find(n => n.props?.borderStyle)
  expect([box.props.borderStyle, box.props.borderColor]).toEqual(['bold', '#ff3ec8'])
  const nodes = walk(tree)
  expect(nodes).toContain(PETNODE)
  expect(nodes.indexOf(PETNODE)).toBeGreaterThan(nodes.findIndex(n => n.props?.borderStyle))
  expect(walk(box)).toContain(PETNODE)
})

test('docked pane: the column is at least the visible body tall, so the status box lands at the bottom', async () => {
  const outer = (extra: object, compact = false) => renderPane(els, M, T, { tab: 'changes' }, 54, compact, 0, () => {}, extra) as any
  expect(outer({ minRows: 30 }).props.minHeight).toBe(30)
  expect(outer({}).props.minHeight).toBeUndefined()
  expect(outer({ minRows: undefined }, true).props.minHeight).toBeUndefined()
})

test('compact drawer: one row of pet, everything within COMPACT_ROWS and the width', async () => {
  for (const tab of ['changes', 'agents', 'plan'] as const) {
    const tree = renderPane(els, many(20), T, { tab }, 50, true, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bubble: { text: 'a very long thing to say, far wider than the drawer can hold', mood: 'fail' } })
    const rows = textRows(tree)
    // the tab strip takes one more row
    expect(rows.length + 1).toBeLessThanOrEqual(COMPACT_ROWS)
    for (const r of rows) expect(visibleLength([{ text: r, color: '' }])).toBeLessThanOrEqual(50)
    expect(walk(tree)).toContain(PETNODE)
  }
})

test('a bubble draws a round bordered Box in the mood color beside the pet', async () => {
  for (const [mood, key] of [['fail', 'fail'], ['done', 'pass'], ['needs-you', 'accent']] as const) {
    const tree = renderPane(els, M, T, { tab: 'changes' }, 80, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bubble: { text: 'ouch, 3 failed', mood } })
    const bubble = walk(tree).find(n => n.props?.borderStyle === 'round' && n.props.borderColor === T.colors[key] && walk(n).includes('ouch, 3 failed'))
    expect(bubble, mood).toBeDefined()
  }
})

test('on a narrow pane the bubble sits above the pet and stays inside the width', async () => {
  const tree = renderPane(els, M, T, { tab: 'changes' }, 54, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bubble: { text: 'ouch, 3 failed and then some more words', mood: 'fail' } })
  const nodes = walk(tree)
  const at = nodes.findIndex(n => n.props?.borderColor === T.colors.fail)
  expect(at).toBeGreaterThan(-1)
  expect(at).toBeLessThan(nodes.indexOf(PETNODE))
  for (const r of textRows(tree)) expect(visibleLength([{ text: r, color: '' }])).toBeLessThanOrEqual(54)
})

test("the friday sign sits next to the pet, not in the band", async () => {
  const tree = renderPane(els, M, T, { tab: 'changes' }, 80, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, friday: true })
  expect(walk(tree).some(n => typeof n === 'string' && n.includes("it's friday"))).toBe(true)
})

test('no Text in the pane tree carries a key (Text takes none)', async () => {
  for (const [width, compact] of [[54, false], [80, false], [50, true]] as const)
    for (const extra of [{ friday: true }, { bubble: { text: 'hi', mood: 'done' as const } }, { friday: true, bubble: { text: 'ouch', mood: 'fail' as const } }, {}])
      for (const n of walk(renderPane(els, M, T, { tab: 'changes' }, width, compact, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, ...extra })))
        if (n?.type === 'Text') expect(n.props.key).toBeUndefined()
})

test('petStripCols is the width of the Box the Client sits in', async () => {
  expect(petStripCols(80)).toBe(46)
  expect(petStripCols(54)).toBe(46)
  expect(petStripCols(40)).toBe(34)
  const tree = renderPane(els, M, T, { tab: 'changes' }, 40, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE } })
  expect(walk(tree).find(n => n.props?.width === 34 && walk(n).includes(PETNODE))).toBeDefined()
})

test('an outfit makes the strip two rows taller', async () => {
  const strip = (rows?: number) => walk(renderPane(els, M, T, { tab: 'changes' }, 54, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE, rows } })).find(n => n.props?.height && walk(n).includes(PETNODE) && n.props.width === undefined)
  expect(strip()!.props.height).toBe(6)
  expect(strip(8)!.props.height).toBe(8)
})

test('HP and COMBO show in the status box under an arcade look', async () => {
  const rows = text(statusRows({ ...M, combo: 4 }, T, 54, 0, arcade))
  expect(rows[0]).toContain('COMBO x4')
  expect(rows[1]).toContain('HP ')
  expect(rows[1]).toContain('36% context left')
  expect(text(statusRows({ ...M, limits: [{ kind: 'seven_day', percentUsed: 20 }] }, T, 54, 0, arcade))[1]).toContain('80% weekly limit left')
})

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

const SAMPLES = [
  ...Object.values(CLAWD_SAY).flat().map(t => t.replace('{n}', '3').replace('{command}', 'npm')),
  'tests are sulking, so am i, honestly ok',
  'green at last, i knew you had it in you',
  'supercalifragilisticexpialidocious!!!!!!',
  'a b c d e f g h i j k l m n o p q r s t',
  'x'.repeat(40),
]

test('every bubble line wraps at spaces, in two rows at most, inside the pane', async () => {
  for (const [width, compact] of [[30, false], [40, false], [60, false], [90, false], [30, true], [40, true], [60, true]] as const) {
    const box = bubbleBox(width, compact)
    for (const text of SAMPLES) {
      const tree = renderPane(els, M, T, { tab: 'changes' }, width, compact, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bubble: { text, mood: 'fail' } })
      const bub = walk(tree).find(n => n?.props?.borderColor === T.colors.fail)
      // the bubble's own rows are checked line by line below; textRows would join its lines
      const own = (bub?.children ?? []).map((c: any) => c.children.join('')).join('')
      for (const r of textRows(tree)) if (r !== own) expect(visibleLength([{ text: r, color: '' }]), `${width} ${text}`).toBeLessThanOrEqual(width)
      const lines: string[] = compact
        ? [String(walk(tree).filter(n => n?.type === 'Text' && typeof n.children?.[0] === 'string' && n.children[0].startsWith(' ')).map(n => n.children[0]).pop() ?? '').trim()]
        : (bub?.children ?? []).map((c: any) => c.children.join(''))
      expect(lines.length, `${width} ${text}`).toBeGreaterThan(0)
      expect(lines.length).toBeLessThanOrEqual(box.lines)
      const words = new Set(text.split(' '))
      lines.forEach((l, i) => {
        expect(visibleLength([{ text: l, color: '' }]), `${width}/${compact} ${text} -> ${l}`).toBeLessThanOrEqual(box.cols)
        const cut = l.endsWith('…')
        const parts = l.replace(/…$/, '').split(' ').filter(Boolean)
        // a whole word, unless this line was cut at its end
        parts.forEach((p, j) => { if (!(cut && j === parts.length - 1 && i === lines.length - 1)) expect(words.has(p), `${l}`).toBe(true) })
      })
      if (!lines.at(-1)!.endsWith('…')) expect(lines.join(' ')).toBe(text)
    }
  }
})

// Rows a tree takes: Box columns sum, rows take the tallest, a set height wins, a border adds two.
const rowsOf = (n: any): number => {
  if (!n || typeof n !== 'object') return 0
  if (n.type === 'Text' || n.type === 'Button') return 1
  if (n.type !== 'Box') return 0
  const kids = (n.children ?? []).flat(Infinity).map(rowsOf)
  const inside = n.props.flexDirection === 'row' ? Math.max(0, ...kids) : kids.reduce((a: number, b: number) => a + b, 0)
  return (n.props.height ?? inside) + (n.props.borderStyle ? 2 : 0) + (n.props.marginTop ?? 0)
}

test('a long tab leaves the pet and status box in the rows the pane has, docked or inline', async () => {
  const BODY = 30
  for (const [width, compact] of [[54, false], [80, false], [50, true]] as const)
    for (const tab of ['changes', 'agents', 'plan'] as const) {
      const tree = renderPane(els, many(60), T, { tab }, width, compact, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bodyRows: compact ? COMPACT_ROWS : BODY, minRows: compact ? undefined : BODY }) as any
      expect(rowsOf(tree), `${tab} ${width}`).toBeLessThanOrEqual(compact ? COMPACT_ROWS : BODY)
      expect(walk(tree)).toContain(PETNODE)
    }
})

test('with a bubble above the pet the long tab still fits the body exactly', async () => {
  const tree = renderPane(els, many(60), T, { tab: 'changes' }, 54, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bubble: { text: 'ouch, 3 failed', mood: 'fail' }, bodyRows: 30 }) as any
  expect(rowsOf(tree)).toBe(30)
})

test('a long tab scrolls inside its rows, with buttons for the hidden ones', async () => {
  const draw = (offset?: number, onScroll: (o: number) => void = () => {}) => renderPane(els, many(60), T, { tab: 'changes', offset }, 54, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bodyRows: 30, onScroll }) as any
  const all = (t: any) => walk(t).filter(n => n.type === 'Text').map(n => n.children.join('')).join('\n')
  expect(all(draw())).toContain('f0.ts')
  expect(all(draw())).not.toContain('f40.ts')
  const labels = (t: any) => walk(t).filter(n => n.type === 'Button').map(b => b.props.label).filter((l: string) => /more/.test(l))
  expect(labels(draw())).toEqual([expect.stringMatching(/^↓ \d+ more$/)])
  expect(all(draw(1000))).toContain('f59.ts')
  expect(labels(draw(1000))).toEqual([expect.stringMatching(/^↑ \d+ more$/)])
  expect(rowsOf(draw(1000))).toBeLessThanOrEqual(30)
  const picks: number[] = []
  const down = walk(draw(0, o => picks.push(o))).find(n => n.type === 'Button' && /↓/.test(n.props.label))
  ;(down.onPress ?? down.props.onPress)({})
  expect(picks[0]).toBeGreaterThan(0)
})
