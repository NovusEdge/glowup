import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { runGlowup, fakeFs, test } from './kit.ts'
import { CLAWD_SAY } from '../hooks/bubbles.ts'

const ENGINE_ROW = { type: 'Text', props: {}, children: ['engine row'] } as RenderElement
const scroll = { offset: 0, bodyRows: 20 }
const PANE = { title: 'glowup', isFocused: false, bodyColumns: 60, placement: 'dock', scroll, view: {} } as never
const BAND = { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 100, scroll, view: {} } as never
const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const petClient = (tree: any) => walk(tree).find(n => n?.type === 'Client' && String(n.props?.module).endsWith('client/pet.tsx'))
const text = (tree: any) => walk(tree).filter(n => typeof n === 'string').join(' ')
function base(on: any, render: (e: any) => void = () => {}, opts: { shown?: boolean; toolText?: string; run?: (argv: string[]) => { exitCode: number; stdout: string } | void; files?: Record<string, string>; toasts?: string[] } = {}) {
  fakeFs(on, opts.files ?? {}, opts.run); mock.store(on)
  on('ui.render', async (_$: unknown, e: any) => { render(e); return ENGINE_ROW })
  on('ui.panes', async () => ({ value: [{ id: 'glowup', isShown: opts.shown ?? true, isPlaced: true }] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$: unknown, e: any) => { opts.toasts?.push(e.text); return { value: undefined } as never })
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: {}, text: opts.toolText ?? 'Tests: 3 failed, 9 passed' }) as never)
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

test('the pet region is sized to the strip so he has room to walk; the compact row stays unsized', { timeoutMs: 20000 }, async ($, on) => {
  base(on); mock.clock(on)
  const pane = await mountPane($)
  expect(petClient(await pane.drawn()).props.width).toBe(46)
  await pane.unmount()
  const inline = await $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'Pane', requestId: 'glowup', props: { ...(PANE as object), placement: 'inline', bodyColumns: 60 } as never })
  expect(petClient(await inline.drawn()).props.width).toBeUndefined()
  await inline.unmount()
})

test('the stored tab setup shapes the tab strip while the pet is on', { timeoutMs: 20000 }, async ($, on) => {
  base(on); mock.clock(on)
  await runGlowup($, 'setup tabs plan,changes')
  const pane = await mountPane($)
  const tree = await pane.drawn()
  expect(petClient(tree)).toBeDefined()
  const labels = walk(tree).filter(n => n?.type === 'Button' && /^\d$/.test(n.props?.hotkey ?? '')).map(n => n.props.label)
  expect(labels).toEqual(['Plan & context', 'Changes'])
  await pane.unmount()
})

test('pet off, or reduced motion: no pet Client in the pane',async ($, on) => {
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

const overlaysNow = async ($: any) => {
  const pane = await mountPane($)
  const c = petClient(await pane.drawn())
  await pane.unmount()
  return c.props.props.overlays as string[]
}

test('a failed test run gives Clawd the sweat until the next prompt, with no friday sign', async ($, on) => {
  base(on); mock.clock(on, { now: Date.UTC(2026, 6, 1, 12) + new Date().getTimezoneOffset() * 60_000 })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  expect(await overlaysNow($)).not.toContain('sweat')
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' } as never)
  const ov = await overlaysNow($)
  expect(ov.filter(o => o === 'sweat')).toHaveLength(1)
  expect(ov).not.toContain('friday')
  await $.turn.start({ text: 'again', turnId: 't2' })
  expect(await overlaysNow($)).not.toContain('sweat')
})

test('a passing test run does not give the sweat', async ($, on) => {
  base(on, undefined, { toolText: 'Tests: 12 passed' }); mock.clock(on, { now: Date.UTC(2026, 6, 1, 12) + new Date().getTimezoneOffset() * 60_000 })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' } as never)
  expect(await overlaysNow($)).not.toContain('sweat')
})

test('date +%z runs only where the process offset is 0', async ($, on) => {
  const ran: string[] = []
  base(on, undefined, { run: argv => { ran.push(argv.join(' ')) } }); mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect(ran.includes('date +%z')).toBe(new Date().getTimezoneOffset() === 0)
})

const PETS = '/fake/.claude/glowup/pets'
const petJson = (name: string) => JSON.stringify({ format: 1, name, palette: { A: '#abcdef' }, animations: { idle: [{ ms: 400, px: Array(12).fill('A'.repeat(24)) }] } })

test('pet robot reaches the Client by id; a user pet carries its sheet', async ($, on) => {
  base(on, undefined, { files: { [`${PETS}/mochi.json`]: petJson('mochi') } }); mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  // the pet directory is under the config dir, which session.start reads
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await runGlowup($, 'pet robot')
  let pane = await mountPane($)
  let c = petClient(await pane.drawn())
  expect(c.props.props.pet).toBe('robot')
  expect('sheet' in c.props.props).toBe(false)
  await pane.unmount()
  await runGlowup($, 'pet mochi')
  pane = await mountPane($)
  c = petClient(await pane.drawn())
  expect(c.props.props.pet).toBe('mochi')
  expect(c.props.props.sheet.palette).toEqual({ A: '#abcdef' })
  await pane.unmount()
})

async function brokenStoredPet($: any, on: any, isInteractive: boolean) {
  const files: Record<string, string> = { [`${PETS}/mochi.json`]: petJson('mochi') }
  const toasts: string[] = []
  base(on, undefined, { files, toasts }); mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive })
  await runGlowup($, 'pet mochi')
  files[`${PETS}/mochi.json`] = '{"format":1,"name":"mochi"'
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive })
  return toasts
}

test('a stored user pet that no longer loads falls back to Clawd with one toast', async ($, on) => {
  const toasts = await brokenStoredPet($, on, true)
  const pane = await mountPane($)
  const c = petClient(await pane.drawn())
  expect(c.props.props.pet).toBe('clawd')
  expect('sheet' in c.props.props).toBe(false)
  const mine = toasts.filter(t => t.includes('mochi'))
  expect(mine).toHaveLength(1)
  expect(mine[0]!.match(/mochi/g)!.length).toBeLessThanOrEqual(2)
  expect(mine[0]).toMatch(/\. Showing Clawd\.$/)
  expect(mine[0]).not.toContain('glowup pet "')
  await pane.unmount()
})

test('a non-interactive run shows no fallback toast', async ($, on) => {
  const toasts = await brokenStoredPet($, on, false)
  expect(toasts.filter(t => t.includes('Showing Clawd'))).toEqual([])
})

test('the robot gets an 8-row strip; Clawd keeps 6', async ($, on) => {
  base(on); mock.clock(on)
  const strip = async () => {
    const pane = await mountPane($)
    const tree = await pane.drawn()
    const box = walk(tree).find(n => n?.type === 'Box' && n.props?.height && walk(n).includes(petClient(tree)))
    await pane.unmount()
    return box.props.height
  }
  await runGlowup($, 'pet clawd')
  expect(await strip()).toBe(6)
  await runGlowup($, 'pet robot')
  expect(await strip()).toBe(8)
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
