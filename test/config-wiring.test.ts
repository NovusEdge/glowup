import { test, expect, mock } from 'claude-code/testing'
import { runGlowup, fakeFs } from './kit.ts'

const PANE = { title: 'glowup', isFocused: true, bodyColumns: 70, placement: 'inline', scroll: { offset: 0, bodyRows: 30 }, view: {} } as never
const mountPane = ($: any) => $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'Pane', requestId: 'glowup', props: PANE })
const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }

const setup = (on: any, opts: { shown?: boolean; files?: Record<string, string>; store?: Record<string, unknown> } = {}) => {
  fakeFs(on, opts.files); const clock = mock.clock(on); mock.store(on, opts.store)
  const opens: any[] = []
  const closes: unknown[] = []
  const toasts: string[] = []
  on('ui.open', async (_$: unknown, e: unknown) => { opens.push(e); return { value: { isPlaced: true } } as never })
  on('ui.close', async (_$: unknown, e: unknown) => { closes.push(e); return { value: undefined } as never })
  on('ui.panes', async () => ({ value: opts.shown ? [{ id: 'glowup', isShown: true, isPlaced: true }] : [] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$: unknown, e: any) => { toasts.push(String(e.text ?? e.message ?? JSON.stringify(e))); return { value: undefined } as never })
  on('session.id', async () => ({ value: 's1' }))
  return { opens, closes, toasts, clock }
}

test('/glowup config opens the glowup pane focused, on the config view', async ($, on) => {
  const { opens } = setup(on)
  await runGlowup($, 'config')
  expect(opens).toEqual([expect.objectContaining({ id: 'glowup', focus: true, closeOnEscape: true })])
  const ui = await mountPane($)
  expect(await ui.find({ text: /Apply/ })).toBeDefined()
  await ui.unmount()
})

test('Apply stores the draft; Cancel and Esc change nothing', async ($, on) => {
  setup(on)
  await runGlowup($, 'config')
  let ui = await mountPane($)
  await ui.select({ key: 'pack', value: 'crt' })
  await ui.press({ key: 'cancel' })
  await ui.unmount()
  expect((await runGlowup($, 'pack list')).text).toContain('● classic')
  await runGlowup($, 'config')
  ui = await mountPane($)
  await ui.select({ key: 'pack', value: 'crt' })
  await ui.press({ key: 'apply' })
  await ui.unmount()
  expect((await runGlowup($, 'pack list')).text).toContain('● crt')
  ui = await mountPane($)
  expect(await ui.find({ text: 'Changes' })).toBeDefined()
  await ui.unmount()
})

test('save-as saves the draft, not the applied look', async ($, on) => {
  setup(on)
  await runGlowup($, 'config')
  const ui = await mountPane($)
  await ui.select({ key: 'pack', value: 'cozy' })
  await ui.input({ key: 'save-as', text: 'mine', kind: 'submit' })
  await ui.unmount()
  expect((await runGlowup($, 'pack mine')).text).toBe('Pack: mine')
  expect((await runGlowup($, 'pack list')).text).toContain('● mine')
})

test('Apply reopens an open drawer without closeOnEscape; a closed pane is closed again', async ($, on) => {
  const s = setup(on, { shown: true })
  await runGlowup($, 'config')
  const ui = await mountPane($)
  await ui.press({ key: 'apply' })
  await ui.unmount()
  expect(s.opens).toHaveLength(2)
  expect(s.opens[1]).toEqual(expect.objectContaining({ id: 'glowup' }))
  expect(s.opens[1]).not.toHaveProperty('closeOnEscape')
  expect(s.closes).toEqual([])
})

test('Cancel closes a pane that was closed before', async ($, on) => {
  const s = setup(on)
  await runGlowup($, 'config')
  const ui = await mountPane($)
  await ui.press({ key: 'cancel' })
  await ui.unmount()
  expect(s.closes).toEqual([expect.objectContaining({ id: 'glowup' })])
})

test('typed save-as text survives the preview redraw', async ($, on) => {
  const { clock } = setup(on)
  await runGlowup($, 'config')
  const ui = await mountPane($)
  await ui.input({ key: 'save-as', text: 'my-pa', kind: 'change' })
  await clock.advance(200)
  const input = walk(await ui.drawn()).find(n => n?.props?.key === 'save-as')
  expect(input.props.value).toBe('my-pa')
  await ui.unmount()
})

test('the shiny pet is offered only once unlocked', async ($, on) => {
  setup(on)
  await runGlowup($, 'config')
  const ui = await mountPane($)
  const sel = walk(await ui.drawn()).find(n => n?.props?.key === 'pet')
  expect(sel.props.options.map((o: any) => o.value)).toEqual(['clawd', 'off'])
  await ui.unmount()
})

test('the pet strip stays under the config view', async ($, on) => {
  setup(on)
  await runGlowup($, 'config')
  const ui = await mountPane($)
  expect(walk(await ui.drawn()).some(n => n?.type === 'Client' && String(n.props?.module).endsWith('client/pet.tsx'))).toBe(true)
  await ui.unmount()
})

test('with shinyAt set the shiny pet is offered', async ($, on) => {
  setup(on, { store: { eggs: { passRuns: 100, shinyAt: 5 } } })
  await runGlowup($, 'config')
  const ui = await mountPane($)
  const sel = walk(await ui.drawn()).find(n => n?.props?.key === 'pet')
  expect(sel.props.options.map((o: any) => o.value)).toEqual(['clawd', 'clawd-shiny', 'off'])
  await ui.unmount()
})
