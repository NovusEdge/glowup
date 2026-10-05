import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { runGlowup, fakeFs, test } from './kit.ts'

const ENGINE_ROW = { type: 'Text', props: {}, children: ['engine row'] } as RenderElement
const scroll = { offset: 0, bodyRows: 30 }
const PANE = { title: 'glowup', isFocused: false, bodyColumns: 60, placement: 'dock', scroll, view: {} } as never
const PROMPT = { text: 'make it oxide', origin: { kind: 'composer' }, isExpanded: false } as never
const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const fieldClient = (tree: any) => walk(tree).find(n => n?.type === 'Client' && String(n.props?.module).endsWith('client/field.tsx'))
const text = (tree: any) => walk(tree).filter(n => typeof n === 'string').join(' ')

function base(on: any) {
  fakeFs(on); mock.store(on)
  on('ui.render', async () => ENGINE_ROW)
  on('ui.panes', async () => ({ value: [{ id: 'glowup', isShown: true, isPlaced: true }] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
}
const mountPane = ($: any) => $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'Pane', requestId: 'glowup', props: PANE })
const mountPrompt = ($: any, requestId: string) => $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'UserMessage', requestId, props: PROMPT })
const FRAMES = { ms: 100, frames: [[[{ text: '⣿⣷', color: '#e0703a' }]], [[{ text: '⣷⣿', color: '#e0703a' }]]] }

test('with no renderer plugin the pane draws as before: no field, the usual life row', async ($, on) => {
  base(on); const clock = mock.clock(on)
  const pane = await mountPane($)
  await pane.drawn(); await clock.advance(1)
  const tree = await pane.drawn()
  expect(fieldClient(tree)).toBeUndefined()
  expect(text(tree)).toContain('context')
  await pane.unmount()
})

test('a field answer plays in the docked pane, asked once for the pack, size and palette', async ($, on) => {
  base(on); const clock = mock.clock(on)
  const asked: any[] = []
  on('glowup.field' as never, (async (_$: unknown, e: any) => { asked.push(e); return { value: FRAMES } }) as never)
  const pane = await mountPane($)
  await pane.drawn(); await clock.advance(1)
  const c = fieldClient(await pane.drawn())
  expect(c).toBeDefined()
  expect(c.props.props.frames.length).toBe(2)
  expect(c.props.props.ms).toBe(100)
  expect(c.props.props.rows).toBeGreaterThan(0)
  expect(asked.length).toBe(1)
  expect(asked[0].pack).toBe('classic')
  expect(asked[0].cols).toBe(58)
  expect(asked[0].reduced).toBe(false)
  expect(asked[0].colors.accent).toMatch(/^#[0-9a-f]{6}$/i)
  await pane.drawn()
  expect(asked.length).toBe(1)
  await pane.unmount()
})

test('reduced motion asks for a still field and the player holds its first frame', async ($, on) => {
  base(on); const clock = mock.clock(on)
  const asked: any[] = []
  on('glowup.field' as never, (async (_$: unknown, e: any) => { asked.push(e); return { value: FRAMES } }) as never)
  await runGlowup($, 'motion reduced')
  const pane = await mountPane($)
  await pane.drawn(); await clock.advance(1)
  const c = fieldClient(await pane.drawn())
  expect(asked.at(-1).reduced).toBe(true)
  expect(c.props.props.reduced).toBe(true)
  await pane.unmount()
})

test('a meter answer replaces the life row; a malformed one leaves it', async ($, on) => {
  base(on); const clock = mock.clock(on)
  let answer: unknown = [[{ text: 'OXIDE METER', color: '#e0703a' }]]
  on('glowup.meter' as never, (async () => ({ value: answer })) as never)
  let pane = await mountPane($)
  await pane.drawn(); await clock.advance(1)
  let body = text(await pane.drawn())
  expect(body).toContain('OXIDE METER')
  expect(body).not.toContain('context')
  await pane.unmount()
  answer = 'not rows'
  await runGlowup($, 'pack crt')
  pane = await mountPane($)
  await pane.drawn(); await clock.advance(1)
  body = text(await pane.drawn())
  expect(body).not.toContain('OXIDE METER')
  await pane.unmount()
})

test('a divider answer draws above each own prompt, numbered by turn', async ($, on) => {
  base(on)
  const turns: number[] = []
  on('glowup.divider' as never, (async (_$: unknown, e: any) => {
    turns.push(e.turn)
    return { value: { left: [{ text: `▓▒░ ${e.turn} `, color: '#e0703a' }], fill: { text: '━', color: '#a3533a' }, right: [{ text: '░▒▓' }] } }
  }) as never)
  const one = await mountPrompt($, 'u1')
  expect(text(await one.drawn())).toContain('▓▒░ 1 ')
  const two = await mountPrompt($, 'u2')
  expect(text(await two.drawn())).toContain('▓▒░ 2 ')
  expect(text(await two.drawn())).toContain('engine row')
  // a redraw keeps its number and does not ask again
  await one.drawn()
  expect(turns).toEqual([1, 2])
  await one.unmount(); await two.unmount()
})

test('without a divider answer the prompt row is unchanged', async ($, on) => {
  base(on)
  const row = await mountPrompt($, 'u1')
  expect(text(await row.drawn())).not.toContain('━')
  await row.unmount()
})
