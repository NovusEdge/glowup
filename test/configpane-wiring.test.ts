import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { runGlowup, fakeFs, test } from './kit.ts'
import { USAGE } from '../hooks/command.ts'

const setup = (on: any, surfaces: string[] = ['terminal'], files: Record<string, string> = {}) => {
  fakeFs(on, files)
  mock.store(on)
  const opens: any[] = [], copies: string[] = [], closes: any[] = []
  on('ui.open', async (_$: unknown, e: unknown) => { opens.push(e); return { value: { isPlaced: true } } as never })
  on('ui.close', async (_$: unknown, e: unknown) => { closes.push(e); return { value: undefined } as never })
  on('ui.copy', async (_$: unknown, e: any) => { copies.push(e.text); return { value: undefined } as never })
  on('ui.panes', async () => ({ value: [] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  on('session.surfaces', async () => ({ value: surfaces }) as never)
  on('session.id', async () => ({ value: 's1' }))
  return { opens, copies, closes }
}
const mountConfig = ($: any, surface = 'terminal') => $.ui.mount({ plugin: 'glowup', surface, component: 'Pane', requestId: 'glowup-config', props: { title: 'glowup config', isFocused: true, bodyColumns: 90, placement: 'inline', scroll: { offset: 0, bodyRows: 40 }, view: {} } })

test('/glowup config opens the focused config pane and asks nothing', async ($, on) => {
  const s = setup(on)
  const out = await runGlowup($, 'config')
  expect(s.opens.map(o => o.id)).toEqual(['glowup-config'])
  expect(s.opens[0].focus).toBe(true)
  expect(s.opens[0].closeOnEscape).toBe(true)
  expect(out.text).toContain('Esc closes it')
})

test('a headless /glowup config prints the usage', async ($, on) => {
  setup(on, [])
  expect((await runGlowup($, 'config')).text).toBe(USAGE)
})

test('Enter on Pack applies the next pack through the pack command', async ($, on) => {
  setup(on)
  await runGlowup($, 'config')
  const ui = await mountConfig($)
  await ui.press({ key: 'cycle-pack' })
  expect((await runGlowup($, 'pack list')).text).toMatch(/● \S+/)
  expect((await runGlowup($, 'pack list')).text).not.toContain('● classic')
  await ui.unmount()
})

test('a submitted hex sets the override; a bad one leaves it and says why', async ($, on) => {
  setup(on)
  await runGlowup($, 'config')
  const ui = await mountConfig($)
  await ui.input({ key: 'input-color:accent', text: '112233', kind: 'submit' })
  expect((await runGlowup($, 'color list')).text).toContain('● accent #112233')
  await ui.input({ key: 'input-color:accent', text: 'blue', kind: 'submit' })
  expect((await runGlowup($, 'color list')).text).toContain('● accent #112233')
  expect(await ui.find({ text: /is not a color/ })).toBeDefined()
  await ui.unmount()
})

test('tabs typed in a new order reorder the main pane', async ($, on) => {
  setup(on)
  await runGlowup($, 'config')
  const ui = await mountConfig($)
  await ui.input({ key: 'input-tabs', text: 'plan, changes', kind: 'submit' })
  expect((await runGlowup($, 'setup')).text).toContain('tabs           plan, changes')
  await ui.unmount()
})

test('a pack deleted after the pane opened shows the error and the pane keeps drawing', async ($, on) => {
  const files = { '/fake/.claude/glowup/packs/zzz.json': JSON.stringify({ format: 1, name: 'zzz', colors: { theme: 'classic' } }) }
  setup(on, ['terminal'], files)
  await runGlowup($, 'pack zzz')
  await runGlowup($, 'pack classic')
  await runGlowup($, 'config')
  delete (files as Record<string, string>)['/fake/.claude/glowup/packs/zzz.json']
  const ui = await mountConfig($)
  for (let i = 0; i < 20 && !(await ui.find({ text: /zzz/ })); i++) await ui.press({ key: 'cycle-pack' })
  await ui.press({ key: 'cycle-pack' })
  expect(await ui.find({ key: 'cycle-pack' })).toBeDefined()
  await ui.unmount()
})

test('Done closes the config pane only', async ($, on) => {
  const s = setup(on)
  await runGlowup($, 'config')
  const ui = await mountConfig($)
  await ui.press({ key: 'done' })
  expect(s.closes.map(c => c.id)).toEqual(['glowup-config'])
  await ui.unmount()
})

test('the meter cycle runs both of its commands', async ($, on) => {
  setup(on)
  await runGlowup($, 'config')
  const ui = await mountConfig($)
  await ui.press({ key: 'cycle-meter' })
  const text = (await runGlowup($, 'setup')).text!
  expect(text).toContain('meter.warn     60')
  expect(text).toContain('meter.danger   85')
  await ui.unmount()
})

test('/glowup config output is no longer drawn as a card', async ($, on) => {
  setup(on)
  const text = (await runGlowup($, 'config')).text!
  const ui = await $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'CommandOutput', props: { command: 'glowup', args: 'config', text, isErrored: false } })
  expect(await ui.find({ text: 'engine' })).toBeDefined()
  await ui.unmount()
})
