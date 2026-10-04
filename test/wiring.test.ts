import { test, expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

declare function setTimeout(fn: (value: unknown) => void, ms: number): unknown
const scroll = { offset: 0, bodyRows: 10 }

test('band is empty when idle, on terminal and desktop', async ($, on) => {
  // the harness has no engine under the hooks: answer what the band asks of it
  on('ui.panes', async () => ({ value: [] }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  for (const surface of ['terminal', 'desktop'] as const) {
    const idle = await $.ui.mount({ plugin: 'glowup', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll, view: {} } })
    expect(await idle.find({ text: /♥/ })).toBeUndefined()
    await idle.unmount()
  }
})

const BAND = { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 100, scroll, view: {} }

test('the band shows during a turn and folds after the linger', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.panes', async () => ({ value: [] }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /♥/ })).toBeDefined()
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 10, isAborted: false, turnId: 't1' })
  // the linger is measured on Date.now (wall time), which mock.clock does not move
  await new Promise(r => setTimeout(r, 1550))
  await clock.advance(1700)
  await ui.unmount()
  const after = await $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, isWorking: false } })
  expect(await after.find({ text: /♥/ })).toBeUndefined()
  await after.unmount()
})

test('/clear starts the model over under the new session id', async ($, on) => {
  let id = 's1'
  on('ui.panes', async () => ({ value: [] }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  on('session.id', async () => ({ value: id }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  mock.clock(on)
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const working = await $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await working.find({ text: /♥/ })).toBeDefined()
  await working.unmount()
  id = 's2'
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  const cleared = await $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await cleared.find({ text: /♥/ })).toBeUndefined()
  await cleared.unmount()
})

test('pane draws three tab buttons', async $ => {
  const ui = await $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'Pane', requestId: 'glowup', props: { title: 'glowup', isFocused: false, bodyColumns: 54, placement: 'dock', scroll, view: {} } })
  for (const label of ['Changes', 'Agents', 'Plan & context']) expect(await ui.find({ text: label })).toBeDefined()
  await ui.press({ key: 'tab-agents' })
  expect(await ui.find({ text: /AGENTS/ })).toBeDefined()
  await ui.unmount()
})

const TOOL = { tool_use_id: 'u1', tool: 'Write', input: {}, isRunning: false, isErrored: false, isInterrupted: false }

test('ToolUse rows get a glyph only when finished and of a known kind', async ($, on) => {
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine row'] }) as RenderElement)
  const draw = async (props: typeof TOOL) => {
    const ui = await $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'ToolUse', requestId: 'u1', props })
    const out = { row: await ui.find({ text: /engine row/ }), glyph: await ui.find({ text: /✎|▸/ }) }
    await ui.unmount()
    return out
  }
  const done = await draw(TOOL)
  expect(done.row).toBeDefined()
  expect(done.glyph).toBeDefined()
  for (const props of [{ ...TOOL, isRunning: true }, { ...TOOL, tool: 'mcp__x__y' }]) {
    const r = await draw(props)
    expect(r.row).toBeDefined()
    expect(r.glyph).toBeUndefined()
  }
})
