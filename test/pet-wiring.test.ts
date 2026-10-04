import { test, expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { runGlowup, fakeFs } from './kit.ts'
import { CLAWD_SAY } from '../hooks/bubbles.ts'

const ENGINE_ROW = { type: 'Text', props: {}, children: ['engine row'] } as RenderElement
const scroll = { offset: 0, bodyRows: 20 }
const PANE = { title: 'glowup', isFocused: false, bodyColumns: 60, placement: 'dock', scroll, view: {} } as never
const BAND = { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 100, scroll, view: {} } as never
const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const petClient = (tree: any) => walk(tree).find(n => n?.type === 'Client' && String(n.props?.module).endsWith('client/pet.tsx'))
const text = (tree: any) => walk(tree).filter(n => typeof n === 'string').join(' ')
function base(on: any, render: (e: any) => void = () => {}, opts: { shown?: boolean; run?: (argv: string[]) => { exitCode: number; stdout: string } | void } = {}) {
  fakeFs(on, {}, opts.run); mock.store(on)
  on('ui.render', async (_$: unknown, e: any) => { render(e); return ENGINE_ROW })
  on('ui.panes', async () => ({ value: [{ id: 'glowup', isShown: opts.shown ?? true, isPlaced: true }] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: {}, text: 'Tests: 3 failed, 9 passed' }) as never)
}
const mountPane = ($: any) => $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'Pane', requestId: 'glowup', props: PANE })

test('the pane hosts the pet Client with raw inputs; the band never does', { timeoutMs: 20000 }, async ($, on) => {
  base(on); mock.clock(on)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const pane = await mountPane($)
  const c = petClient(await pane.drawn())
  expect(c).toBeDefined()
  expect(c.props.props.input.working).toBe(true)
  expect(c.props.props.width).toBe(46)
  expect('pose' in c.props.props).toBe(false)
  const band = await $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(petClient(await band.drawn())).toBeUndefined()
  await pane.unmount(); await band.unmount()
})

test('pet off, or reduced motion: no pet Client in the pane', async ($, on) => {
  base(on); mock.clock(on)
  for (const cmd of ['pet off', 'motion reduced']) {
    await runGlowup($, cmd)
    const pane = await mountPane($)
    expect(petClient(await pane.drawn())).toBeUndefined()
    await pane.unmount()
    await runGlowup($, cmd === 'pet off' ? 'pet clawd' : 'motion full')
  }
})

test('a failing test run shows a fail bubble in the pane for 3 s', async ($, on) => {
  base(on); const clock = mock.clock(on)
  await runGlowup($, 'bubbles on')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' } as never)
  const said = CLAWD_SAY.fail.map(l => l.replace('{n}', '3'))
  let pane = await mountPane($)
  let body = text(await pane.drawn())
  expect(said.some(l => body.includes(l))).toBe(true)
  await pane.unmount()
  await clock.advance(3100)
  pane = await mountPane($)
  body = text(await pane.drawn())
  expect(said.some(l => body.includes(l))).toBe(false)
  await pane.unmount()
})

test('pet changes do not redraw the band', async ($, on) => {
  let bandDraws = 0
  base(on, e => { if (e.component === 'AbovePrompt') bandDraws++ })
  const clock = mock.clock(on)
  const band = await $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  const before = bandDraws
  await runGlowup($, 'bubbles on')
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b2', command: 'npm test' } as never)
  await clock.advance(3200)
  expect(bandDraws - before).toBeLessThanOrEqual(2)
  await band.unmount()
})

const FAIL_SAY = CLAWD_SAY.fail.map(l => l.replace('{n}', '3'))

test('no bubble while the pane is hidden', async ($, on) => {
  base(on, undefined, { shown: false }); mock.clock(on)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' } as never)
  const pane = await mountPane($)
  const body = text(await pane.drawn())
  expect(FAIL_SAY.some(l => body.includes(l))).toBe(false)
  await pane.unmount()
})

test('a friday deploy puts the sign in the pane', async ($, on) => {
  base(on)
  // local time is clock + offset, and the offset is this machine's own zone
  mock.clock(on, { now: Date.UTC(2026, 9, 9, 18) + new Date().getTimezoneOffset() * 60_000 })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'git push origin main' } as never)
  const pane = await mountPane($)
  expect(text(await pane.drawn())).toContain("it's friday")
  await pane.unmount()
})

test('date +%z runs only where the process offset is 0', async ($, on) => {
  const ran: string[] = []
  base(on, undefined, { run: argv => { ran.push(argv.join(' ')) } }); mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect(ran.includes('date +%z')).toBe(new Date().getTimezoneOffset() === 0)
})

test('the pack look reaches the band and the pane, pet on or off', async ($, on) => {
  base(on); mock.clock(on)
  await runGlowup($, 'pack arcade')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const band = await $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(text(await band.drawn())).toContain('HP')
  await band.unmount()
  for (const cmd of ['', 'pet off']) {
    if (cmd) await runGlowup($, cmd)
    const pane = await mountPane($)
    expect(text(await pane.drawn())).toContain('HP')
    await pane.unmount()
  }
})
