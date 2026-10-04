import { test, expect, mock } from 'claude-code/testing'
import { runGlowup, fakeFs } from './kit.ts'
import { resolveLook, exportMix } from '../hooks/packs.ts'

const PANE = { title: 'glowup', isFocused: true, bodyColumns: 70, placement: 'inline', scroll: { offset: 0, bodyRows: 30 }, view: {} } as never
const mountPane = ($: any) => $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'Pane', requestId: 'glowup', props: PANE })
const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }

const setup = (on: any, opts: { shown?: boolean; files?: Record<string, string>; store?: Record<string, unknown> } = {}) => {
  const { files } = fakeFs(on, opts.files); const clock = mock.clock(on)
  const stored: string[] = []
  const configWrites: number[] = []
  const kv: Record<string, unknown> = { ...opts.store }
  on('store.get', async (_$: unknown, e: any) => ({ value: kv[e.key] }) as never)
  on('store.set', async (_$: unknown, e: any) => { kv[e.key] = e.value; stored.push(e.key); return { value: undefined } as never })
  on('store.delete', async (_$: unknown, e: any) => { delete kv[e.key]; return { value: undefined } as never })
  on('state.set', async (_$: unknown, e: any, next: any) => { if (e.key === 'config') configWrites.push(Date.now()); return next(e) })
  const opens: any[] = []
  const closes: unknown[] = []
  const toasts: string[] = []
  on('ui.open', async (_$: unknown, e: unknown) => { opens.push(e); return { value: { isPlaced: true } } as never })
  on('ui.close', async (_$: unknown, e: unknown) => { closes.push(e); return { value: undefined } as never })
  on('ui.panes', async () => ({ value: opts.shown || opens.length > 0 ? [{ id: 'glowup', isShown: true, isPlaced: true }] : [] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$: unknown, e: any) => { toasts.push(String(e.text ?? e.message ?? JSON.stringify(e))); return { value: undefined } as never })
  on('session.id', async () => ({ value: 's1' }))
  return { opens, closes, toasts, clock, files, stored, configWrites }
}

test('/glowup config opens the glowup pane focused, on the config view', { timeoutMs: 20000 }, async ($, on) => {
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
  const { files } = setup(on)
  await runGlowup($, 'config')
  const ui = await mountPane($)
  await ui.select({ key: 'pack', value: 'cozy' })
  await ui.input({ key: 'save-as', text: 'mine', kind: 'submit' })
  await ui.unmount()
  const saved = JSON.parse(files[Object.keys(files).find(f => f.endsWith('/mine.json'))!]!)
  const want = exportMix(resolveLook({ colors: 'cozy', motion: 'cozy' }, {}, {}).look, 'mine')
  const classic = exportMix(resolveLook({ colors: 'classic', motion: 'classic' }, {}, {}).look, 'mine')
  expect(saved).toEqual(want)
  expect(saved).not.toEqual(classic)
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
  const all = walk(await ui.drawn())
  const at = all.findIndex(n => n?.type === 'Client' && String(n.props?.module).endsWith('client/pet.tsx'))
  expect(at).toBeGreaterThan(all.findIndex(n => n?.props?.label === 'Apply'))
  await ui.select({ key: 'pet', value: 'off' })
  expect(walk(await ui.drawn()).some(n => n?.type === 'Client')).toBe(false)
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

test('the preview timer stops with reduced motion, Apply, Cancel and close', async ($, on) => {
  const s = setup(on)
  await runGlowup($, 'motion reduced')
  const quiet = async () => { const n = s.configWrites.length; await s.clock.advance(200); expect(s.configWrites.length).toBe(n) }
  await runGlowup($, 'config')
  await quiet()
  await runGlowup($, 'pane')
  await quiet()
  for (const how of ['apply', 'cancel']) {
    await runGlowup($, 'config')
    const ui = await mountPane($)
    await ui.press({ key: 'reduced' })
    await ui.press({ key: 'reduced' })
    await s.clock.advance(100)
    await ui.press({ key: how })
    await ui.unmount()
    await quiet()
  }
})

test('Cancel puts back a drawer opened with closeOnEscape', async ($, on) => {
  const s = setup(on)
  await runGlowup($, 'pane')
  await runGlowup($, 'config')
  const ui = await mountPane($)
  await ui.press({ key: 'cancel' })
  await ui.unmount()
  expect(s.opens.at(-1)).toEqual(expect.objectContaining({ id: 'glowup', closeOnEscape: true }))
})

test('a second /glowup config keeps the draft and the first snapshot', async ($, on) => {
  const s = setup(on)
  await runGlowup($, 'config')
  const ui = await mountPane($)
  await ui.select({ key: 'pack', value: 'cozy' })
  await runGlowup($, 'config')
  await ui.press({ key: 'cancel' })
  await ui.unmount()
  expect(s.closes).toHaveLength(1)
  expect((await runGlowup($, 'pack list')).text).toContain('● classic')
})

test('Apply stores only what the draft changed', { options: { reducedMotion: true } }, async ($, on) => {
  const s = setup(on)
  await runGlowup($, 'config')
  const ui = await mountPane($)
  await ui.select({ key: 'pack', value: 'cozy' })
  await ui.press({ key: 'apply' })
  await ui.unmount()
  expect(s.stored).toContain('mix')
  expect(s.stored).not.toContain('reducedMotion')
  expect(s.stored).not.toContain('pet')
})

test('closing the pane mid-dialog drops the draft and does not reopen it', async ($, on) => {
  const s = setup(on, { shown: true })
  await runGlowup($, 'config')
  const ui = await mountPane($)
  await ui.select({ key: 'pack', value: 'cozy' })
  await runGlowup($, 'pane')
  await ui.unmount()
  expect(s.opens).toHaveLength(1)
  expect((await runGlowup($, 'pack list')).text).toContain('● classic')
})
