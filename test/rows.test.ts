import { test, expect } from 'claude-code/testing'
import { styleRow, type RowInput } from '../hooks/rows.tsx'
import { resolveLook, type Look } from '../hooks/packs.ts'

const els = { Box: 'Box', Text: 'Text' }
const ENGINE = { type: 'engine', ref: 7 }
const look = (n: string) => resolveLook({ colors: n, motion: n }, {}, {}).look
const walk = (n: any, out: any[] = []): any[] => { if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const text = (n: any) => walk(n).flatMap(x => (x.children ?? []).filter((c: unknown) => typeof c === 'string')).join('')
const hasEngine = (n: any) => walk(n).includes(ENGINE)
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
  const card = styleRow(els, l, tool(), ENGINE) as any
  expect([card.type, card.props.borderStyle, card.props.borderColor]).toEqual(['Box', 'bold', l.theme.colors.faint])
  expect(card.props.borderColor).not.toBe(l.borderColor)
  expect(hasEngine(card)).toBe(true)
})

test('cards: tool results stay indented 2', async () => {
  const r = styleRow(els, look('cozy'), { site: 'ToolResult' }, ENGINE) as any
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
  expect(styleRow(els, l, tool({ isErrored: true }), ENGINE)).toBe(ENGINE)
  expect(styleRow(els, l, tool({ isInterrupted: true }), ENGINE)).toBe(ENGINE)
  expect(text(styleRow(els, l, user(), ENGINE))).toBe('› fix the test')
})

test("only the person's own, compact prompts are styled", async () => {
  for (const n of ['arcade', 'crt']) {
    expect(styleRow(els, look(n), user({ own: false }), ENGINE)).toBe(ENGINE)
    expect(styleRow(els, look(n), user({ isExpanded: true }), ENGINE)).toBe(ENGINE)
  }
})

test('a throw inside a style returns the engine element', async () => {
  const broken = { ...look('arcade'), get theme(): never { throw new Error('boom') } } as Look
  expect(styleRow(els, broken, tool(), ENGINE)).toBe(ENGINE)
})

test('retro: bold [YOU] and [CLAUDE] tags, engine indented 9', async () => {
  const l = look('crt')
  const u = styleRow(els, l, user(), ENGINE)
  expect(text(u)).toBe('[YOU] ')
  expect(walk(u).find(n => n.type === 'Text')?.props.bold).toBe(true)
  const first = styleRow(els, l, { site: 'AssistantMessage', isFirstOfReply: true }, ENGINE)
  expect(text(first)).toBe('[CLAUDE]')
  expect(walk(first).find(n => n.type === 'Text')?.props.bold).toBe(true)
  const pad = (n: any) => walk(n).find(x => x.props?.paddingLeft)?.props.paddingLeft
  expect(pad(first)).toBe(9)
  expect(pad(styleRow(els, l, { site: 'AssistantMessage', isFirstOfReply: false }, ENGINE))).toBe(9)
  expect(pad(styleRow(els, l, { site: 'ToolResult' }, ENGINE))).toBe(9)
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
