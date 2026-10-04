import { test, expect } from 'claude-code/testing'
import { styleRow, type RowInput } from '../hooks/rows.tsx'
import { resolveLook, type Look } from '../hooks/packs.ts'

const els = { Box: 'Box', Text: 'Text' }
const ENGINE = { type: 'engine', ref: 7 }
const look = (n: string) => resolveLook({ colors: n, motion: n }, {}, {}).look
const walk = (n: any, out: any[] = []): any[] => { if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const text = (n: any) => walk(n).flatMap(x => (x.children ?? []).filter((c: unknown) => typeof c === 'string')).join('')
const hasEngine = (n: any) => walk(n).includes(ENGINE)
const inner = (n: any) => (n.props?.marginLeft === 1 && n.children?.length === 1 ? n.children[0] : n)
const tool = (o: Partial<Extract<RowInput, { site: 'ToolUse' }>> = {}): RowInput => ({ site: 'ToolUse', tool: 'Read', input: { file_path: '/r/src/auth.ts' }, isRunning: false, isErrored: false, isInterrupted: false, ...o })
const user = (o: Partial<Extract<RowInput, { site: 'UserMessage' }>> = {}): RowInput => ({ site: 'UserMessage', text: 'fix the test', isExpanded: false, own: true, ...o })

test('classic leaves every row to the engine, plus the finished tool glyph', async () => {
  const l = look('classic')
  for (const r of [user(), { site: 'AssistantMessage', isFirstOfReply: true } as RowInput, { site: 'ToolResult' } as RowInput]) expect(styleRow(els, l, r, ENGINE)).toBe(ENGINE)
  expect(text(styleRow(els, l, tool(), ENGINE))).toContain('▸')
  expect(styleRow(els, l, tool({ isRunning: true }), ENGINE)).toBe(ENGINE)
})

const bar = (n: any) => walk(n).find(x => x.type === 'Text' && x.children?.[0] === '▎ ')
const bordered = (n: any) => walk(n).some(x => x.props?.borderStyle)
const asst = (first = true): RowInput => ({ site: 'AssistantMessage', isFirstOfReply: first })

test('cards: messages have no box, a side bar in accent (you) or faint (claude), accent label', async () => {
  const l: Look = { ...look('arcade'), gradient: undefined }
  const u = styleRow(els, l, user(), ENGINE)
  expect(bordered(u)).toBe(false)
  expect(bar(u).props.color).toBe(l.theme.colors.accent)
  const label = walk(u).find(x => x.type === 'Text' && text(x) === 'you')
  expect([label.props.color, label.props.bold]).toEqual([l.theme.colors.accent, undefined])
  expect(hasEngine(u)).toBe(true)
  for (const first of [true, false]) {
    const a = styleRow(els, l, asst(first), ENGINE)
    expect(bordered(a)).toBe(false)
    expect(bar(a).props.color).toBe(l.theme.colors.faint)
    expect(hasEngine(a)).toBe(true)
  }
})

test('cards: tool rows keep the pack border style, framed in faint', async () => {
  const l = look('arcade')
  const card = inner(styleRow(els, l, tool(), ENGINE)) as any
  expect([card.type, card.props.borderStyle, card.props.borderColor]).toEqual(['Box', 'bold', l.theme.colors.faint])
  expect(card.props.borderColor).not.toBe(l.borderColor)
  expect(hasEngine(card)).toBe(true)
})

test('cards: tool results stay indented 2', async () => {
  const r = inner(styleRow(els, look('cozy'), { site: 'ToolResult' }, ENGINE)) as any
  expect(r.props.paddingLeft).toBe(2)
  expect(bordered(r)).toBe(false)
})

test('cards: claude label only on the first block of a reply', async () => {
  const l = look('cozy')
  expect(text(styleRow(els, l, { site: 'AssistantMessage', isFirstOfReply: true }, ENGINE))).toContain('claude')
  expect(text(styleRow(els, l, { site: 'AssistantMessage', isFirstOfReply: false }, ENGINE))).not.toContain('claude')
})

test('tool marks: done, failed, interrupted, running', async () => {
  for (const [n, marks] of [['arcade', ['✓', '✗', '■', '…']], ['crt', ['[ OK ]', '[FAIL]', '[STOP]', '[....]']]] as const) {
    const l = look(n)
    const got = [tool(), tool({ isErrored: true }), tool({ isInterrupted: true }), tool({ isRunning: true })].map(r => text(styleRow(els, l, r, ENGINE)))
    marks.forEach((m, i) => expect(got[i]).toContain(m))
  }
})

test('minimal: own one-liner for a finished tool; errors and interruptions stay the engine', async () => {
  const l: Look = { ...look('classic'), rows: 'minimal' }
  const done = styleRow(els, l, tool(), ENGINE)
  expect(hasEngine(done)).toBe(false)
  expect(text(done)).toContain('· Reading src/auth.ts')
  expect(inner(styleRow(els, l, tool({ isErrored: true }), ENGINE))).toBe(ENGINE)
  expect(inner(styleRow(els, l, tool({ isInterrupted: true }), ENGINE))).toBe(ENGINE)
  expect(text(styleRow(els, l, user(), ENGINE))).toBe('› fix the test')
})

test("only the person's own, compact prompts are styled", async () => {
  for (const n of ['arcade', 'crt']) {
    expect(inner(styleRow(els, look(n), user({ own: false }), ENGINE))).toBe(ENGINE)
    expect(inner(styleRow(els, look(n), user({ isExpanded: true }), ENGINE))).toBe(ENGINE)
  }
})

test('a throw inside a style returns the engine element', async () => {
  const broken = { ...look('arcade'), get theme(): never { throw new Error('boom') } } as Look
  expect(inner(styleRow(els, broken, tool(), ENGINE))).toBe(ENGINE)
})

test('retro: bold [YOU] and [CLAUDE] tags, engine indented 3', async () => {
  const l = look('crt')
  const u = styleRow(els, l, user(), ENGINE)
  expect(text(u)).toBe('[YOU]')
  expect(walk(u).find(n => n.type === 'Text')?.props.bold).toBe(true)
  const first = styleRow(els, l, { site: 'AssistantMessage', isFirstOfReply: true }, ENGINE)
  expect(text(first)).toBe('[CLAUDE]')
  expect(walk(first).find(n => n.type === 'Text')?.props.bold).toBe(true)
  const pad = (n: any) => walk(n).find(x => x.props?.paddingLeft)?.props.paddingLeft
  expect(pad(first)).toBe(3)
  expect(pad(styleRow(els, l, { site: 'AssistantMessage', isFirstOfReply: false }, ENGINE))).toBe(3)
  expect(pad(styleRow(els, l, { site: 'ToolResult' }, ENGINE))).toBe(3)
})

test('prefixCards: tool rows also use a faint side bar instead of a border', async () => {
  const l = look('arcade')
  const c = styleRow(els, l, tool(), ENGINE, { prefixCards: true })
  expect(bordered(c)).toBe(false)
  expect(bar(c).props.color).toBe(l.theme.colors.faint)
  expect(hasEngine(c)).toBe(true)
  expect(text(c)).toContain('✓')
})

test('prefixCards leaves message rows as they are without it', async () => {
  const l = look('arcade')
  expect(bar(styleRow(els, l, user(), ENGINE, { prefixCards: true })).props.color).toBe(l.theme.colors.accent)
  expect(bar(styleRow(els, l, asst(), ENGINE, { prefixCards: true })).props.color).toBe(l.theme.colors.faint)
})

test('non-classic styles indent every row one column, classic does not', async () => {
  const rows: RowInput[] = [user(), user({ own: false }), asst(), asst(false), tool(), tool({ isErrored: true }), { site: 'ToolResult' }]
  for (const style of ['cards', 'minimal', 'retro'] as const) {
    const l: Look = { ...look('arcade'), rows: style }
    for (const r of rows) {
      const s = styleRow(els, l, r, ENGINE) as any
      expect([style, r.site, s.type, s.props.marginLeft, s.props.flexDirection]).toEqual([style, r.site, 'Box', 1, 'column'])
      expect(s.children).toHaveLength(1)
    }
  }
  const cl: Look = { ...look('arcade'), rows: 'classic' }
  for (const r of rows) expect((styleRow(els, cl, r, ENGINE) as any).props?.marginLeft).toBeUndefined()
})

test('the margin wrapper leaves the inner row untouched', async () => {
  const l: Look = { ...look('arcade'), rows: 'cards' }
  const s = styleRow(els, l, tool(), ENGINE) as any
  expect(s.children).toHaveLength(1)
  expect(s.children[0].props.marginLeft).toBeUndefined()
  expect(s.children[0].props.borderStyle).toBeTruthy()
})

test('other styles never draw the side bar or a border on messages', async () => {
  for (const rows of ['minimal', 'retro', 'classic'] as const) {
    const l: Look = { ...look('arcade'), rows }
    for (const r of [user(), asst()]) {
      const s = styleRow(els, l, r, ENGINE)
      expect(bar(s)).toBeUndefined()
      expect(bordered(s)).toBe(false)
    }
  }
})

const cols = (n: any): number => walk(n).filter(x => x.type === 'Text').flatMap(x => x.children ?? []).reduce((s: number, c: any) => s + (typeof c === 'string' ? [...c].length : 0), 0)
// Columns added on the engine's own line: margins, padding, borders, and row-direction siblings.
function beside(n: any): number {
  if (n === ENGINE) return 0
  const p = n.props ?? {}
  const own = (p.marginLeft ?? 0) + (p.paddingLeft ?? 0) + (p.paddingRight ?? 0) + 2 * (p.paddingX ?? 0) + (p.borderStyle ? 2 : 0)
  const kids = n.children ?? []
  const hit = kids.findIndex((k: any) => k === ENGINE || (k && typeof k === 'object' && walk(k).includes(ENGINE)))
  if (hit < 0) return own
  const sib = p.flexDirection === 'row' ? kids.reduce((s: number, k: any, i: number) => (i === hit || typeof k !== 'object' ? s : s + cols(k)), 0) : 0
  return own + sib + beside(kids[hit])
}

test('width budget: ToolResult and UserMessage rows add at most 4 columns beside the engine', async () => {
  for (const name of ['cozy', 'arcade', 'crt']) {
    for (const rows of ['cards', 'retro', 'minimal'] as const) {
      const l: Look = { ...look(name), rows }
      for (const r of [user(), asst(), asst(false), { site: 'ToolResult' } as RowInput]) {
        const s = styleRow(els, l, r, ENGINE)
        if (hasEngine(s)) expect([name, rows, r.site, beside(s) <= 4]).toEqual([name, rows, r.site, true])
      }
    }
  }
  expect(beside(styleRow(els, look('crt'), { site: 'ToolResult' }, ENGINE))).toBe(4)
  expect(beside(styleRow(els, look('crt'), asst(false), ENGINE))).toBe(4)
})

test('retro: [YOU] sits on its own line above the engine row', async () => {
  const u = inner(styleRow(els, look('crt'), user(), ENGINE)) as any
  expect(u.props.flexDirection).toBe('column')
  expect(text(u)).toBe('[YOU]')
  expect(u.children.at(-1)).toBe(ENGINE)
})

test('tool header marks and tags never shrink or wrap; the engine box gives up width', async () => {
  for (const [name, rows] of [['crt', 'retro'], ['arcade', 'cards']] as const) {
    for (const prefixCards of [false, true]) {
      const s = styleRow(els, { ...look(name), rows }, tool(), ENGINE, { prefixCards })
      const mk = walk(s).find(x => x.type === 'Text' && /✓|\[ OK \]/.test(text(x)))
      const wrapper = walk(s).find(x => x.type === 'Box' && x.children?.includes(mk))
      expect([name, prefixCards, wrapper.props.flexShrink, mk.props.wrap]).toEqual([name, prefixCards, 0, 'truncate'])
      const eng = walk(s).find(x => x.type === 'Box' && x.children?.includes(ENGINE))
      expect([name, prefixCards, eng.props.flexShrink, eng.props.minWidth, eng.props.overflow]).toEqual([name, prefixCards, 1, undefined, undefined])
    }
  }
  const c = styleRow(els, look('classic'), tool(), ENGINE) as any
  const g = walk(c).find(x => x.type === 'Text' && text(x).includes('▸'))
  expect([walk(c).find(x => x.type === 'Box' && x.children?.includes(g)).props.flexShrink, g.props.wrap]).toEqual([0, 'truncate'])
  const ce = walk(c).find(x => x.type === 'Box' && x.children?.includes(ENGINE))
  expect([ce.props.flexShrink, ce.props.minWidth, ce.props.overflow]).toEqual([1, undefined, undefined])
  expect(c.props.marginLeft).toBeUndefined()
  const tag = walk(styleRow(els, look('crt'), tool(), ENGINE)).find(x => x.type === 'Box' && x.props?.flexShrink === 0 && text(x).startsWith('[READ'))
  expect(tag).toBeDefined()
})
