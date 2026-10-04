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

test('cards: a bordered Box in the pack border, label as the first Text row', async () => {
  const l = look('arcade')
  const card = styleRow(els, l, user(), ENGINE) as any
  expect([card.type, card.props.borderStyle, card.props.borderColor]).toEqual(['Box', 'bold', '#ff3ec8'])
  expect(card.children[0].type).toBe('Text')
  expect(text(card.children[0])).toBe('you')
  expect(hasEngine(card)).toBe(true)
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

test('prefixCards on tool and assistant rows', async () => {
  for (const r of [tool(), { site: 'AssistantMessage', isFirstOfReply: true } as RowInput]) {
    const c = styleRow(els, look('arcade'), r, ENGINE, { prefixCards: true })
    expect(walk(c).some(n => n.props?.borderStyle)).toBe(false)
    expect(text(c)).toContain('▎')
    expect(hasEngine(c)).toBe(true)
  }
})

test('prefixCards draws a rule column instead of a border', async () => {
  const card = styleRow(els, look('arcade'), user(), ENGINE, { prefixCards: true })
  expect(walk(card).some(n => n.props?.borderStyle)).toBe(false)
  expect(text(card)).toContain('▎')
})
