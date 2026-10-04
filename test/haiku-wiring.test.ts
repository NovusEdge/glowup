import { test, expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { runGlowup, fakeFs } from './kit.ts'
import { CLAWD_SAY } from '../hooks/bubbles.ts'

const ENGINE_ROW = { type: 'Text', props: {}, children: ['engine row'] } as RenderElement
const scroll = { offset: 0, bodyRows: 20 }
const PANE = { title: 'glowup', isFocused: false, bodyColumns: 60, placement: 'dock', scroll, view: {} } as never
const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const text = (tree: any) => walk(tree).filter(n => typeof n === 'string').join(' ')
const FAIL_SAY = CLAWD_SAY.fail.map(l => l.replace('{n}', '3'))

type Model = (req: any) => Promise<any>
const answer = (t: string) => ({ isAnswered: true, text: t, usage: {} })

function rig(on: any, model: Model, opts: { interactive?: boolean } = {}) {
  const prompts: any[] = []
  fakeFs(on, {})
  mock.store(on)
  on('ui.render', async () => ENGINE_ROW)
  on('ui.panes', async () => ({ value: [{ id: 'glowup', isShown: true, isPlaced: true }] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: {}, text: 'Tests: 3 failed, 9 passed' }) as never)
  on('ui.log', async () => ({ value: undefined }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  on('model.complete', async (_$: unknown, e: any) => { prompts.push(e); return { value: await model(e) } as never })
  return { prompts, start: ($: any) => $.session.start({ cwd: '/secret/project', surface: 'terminal', isInteractive: opts.interactive ?? true }) }
}
const failTurn = async ($: any, id: string, prompt = 'hi') => {
  await $.turn.start({ text: prompt, turnId: id })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b' + id, command: 'npm test' } as never)
}
const body = async ($: any) => {
  const pane = await $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'Pane', requestId: 'glowup', props: PANE })
  const t = text(await pane.drawn())
  await pane.unmount()
  return t
}
const flush = async (clock: any) => { await clock.advance(1) }

test('haiku mode swaps the model line into the bubble', async ($, on) => {
  const r = rig(on, async () => answer('  "tests are sulking"\n')); const clock = mock.clock(on)
  await r.start($); await runGlowup($, 'bubbles haiku')
  await failTurn($, 't1'); await flush(clock)
  expect(r.prompts).toHaveLength(1)
  expect(r.prompts[0].model).toBe('haiku')
  expect(await body($)).toContain('tests are sulking')
})

test('the template shows first and a late line is dropped once the bubble is gone', async ($, on) => {
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  const r = rig(on, async () => { await gate; return answer('too late') }); const clock = mock.clock(on)
  await r.start($); await runGlowup($, 'bubbles haiku')
  await failTurn($, 't1'); await flush(clock)
  const shown = await body($)
  expect(FAIL_SAY.some(l => shown.includes(l))).toBe(true)
  await clock.advance(3200)
  release(); await flush(clock)
  expect(await body($)).not.toContain('too late')
})

test('one call per turn, 90 s apart, across many events', async ($, on) => {
  const r = rig(on, async () => answer('hmm')); const clock = mock.clock(on)
  await r.start($); await runGlowup($, 'bubbles haiku')
  await failTurn($, 't1')
  for (let i = 0; i < 5; i++) { await $.tool.call({ tool: 'Bash', tool_use_id: 'x' + i, command: 'npm test' } as never); await clock.advance(5000) }
  expect(r.prompts).toHaveLength(1)
  await failTurn($, 't2'); await clock.advance(5000)
  expect(r.prompts).toHaveLength(1)
  await clock.advance(90_000)
  await failTurn($, 't3'); await flush(clock)
  expect(r.prompts).toHaveLength(2)
  await failTurn($, 't4')
  expect(r.prompts).toHaveLength(2)
})

test('an error or an empty line leaves the template and does not retry', async ($, on) => {
  let n = 0
  const r = rig(on, async () => { n++; return n === 1 ? { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: {} } : answer('"" 🎉') }); const clock = mock.clock(on)
  await r.start($); await runGlowup($, 'bubbles haiku')
  await failTurn($, 't1'); await flush(clock)
  const t1 = await body($)
  expect(FAIL_SAY.some(l => t1.includes(l))).toBe(true)
  expect(r.prompts).toHaveLength(1)
  await clock.advance(91_000)
  await failTurn($, 't2'); await flush(clock)
  expect(r.prompts).toHaveLength(2)
  const t2 = await body($)
  expect(FAIL_SAY.some(l => t2.includes(l))).toBe(true)
})

test('a call that never settles is cut at 4 s and frees the slot after the cooldown', async ($, on) => {
  const r = rig(on, () => new Promise(() => {})); const clock = mock.clock(on)
  await r.start($); await runGlowup($, 'bubbles haiku')
  await failTurn($, 't1')
  await clock.advance(3999); await failTurn($, 't2')
  expect(r.prompts).toHaveLength(1)
  await clock.advance(1)
  const t = await body($)
  expect(t.length).toBeGreaterThan(0)
  await clock.advance(91_000)
  await failTurn($, 't3'); await flush(clock)
  expect(r.prompts).toHaveLength(2)
})

test('bubbles on and off never reach the model', async ($, on) => {
  const r = rig(on, async () => answer('nope')); const clock = mock.clock(on)
  await r.start($)
  for (const mode of ['on', 'off']) {
    await runGlowup($, `bubbles ${mode}`)
    await failTurn($, 'a' + mode); await clock.advance(100_000)
  }
  expect(r.prompts).toHaveLength(0)
})

test('-p, pet off and reduced motion use templates only', async ($, on) => {
  const p = rig(on, async () => answer('nope'), { interactive: false }); const clock = mock.clock(on)
  await p.start($); await runGlowup($, 'bubbles haiku')
  await failTurn($, 't1'); await clock.advance(100_000)
  expect(p.prompts).toHaveLength(0)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  for (const cmd of ['pet off', 'motion reduced']) {
    await runGlowup($, cmd)
    await failTurn($, cmd); await clock.advance(100_000)
    await runGlowup($, cmd === 'pet off' ? 'pet clawd' : 'motion full')
  }
  expect(p.prompts).toHaveLength(0)
})

test('the prompt holds glowup state only: no prompt text, cwd or file contents', async ($, on) => {
  const r = rig(on, async () => answer('ok')); const clock = mock.clock(on)
  await r.start($); await runGlowup($, 'bubbles haiku')
  await failTurn($, 't1', 'SECRET-PROMPT api_key=hunter2 in /home/me/.ssh/id_rsa')
  await flush(clock)
  expect(r.prompts).toHaveLength(1)
  const sent = `${r.prompts[0].system}\n${r.prompts[0].prompt}`
  for (const bad of ['SECRET-PROMPT', 'hunter2', '.ssh', '/secret/project']) expect(sent).not.toContain(bad)
  expect(r.prompts[0].prompt).toMatch(/^mood: fail\npose: /)
  expect(r.prompts[0].prompt).toContain('tests: failed 3')
  expect(r.prompts[0].prompt).toMatch(/time: (morning|afternoon|evening|night)$/)
})
