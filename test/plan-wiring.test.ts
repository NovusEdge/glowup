import { test, expect, mock } from 'claude-code/testing'
import { fakeFs } from './kit.ts'

const task = (id: string, subject: string, status: string) => JSON.stringify({ id, subject, status, description: '', blocks: [], blockedBy: [] })
const PANE = { plugin: 'glowup', surface: 'terminal', component: 'Pane', requestId: 'glowup', props: { title: 'glowup', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as const

function boot(on: Parameters<typeof fakeFs>[0]) {
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: {}, text: 'ok' }) as never)
}

test('the plan loads the saved task list at start and reads it again after TaskUpdate', { timeoutMs: 20000 }, async ($, on) => {
  const dir = '/fake/.claude/tasks/fake-proj'
  const { files } = fakeFs(on, { [`${dir}/1.json`]: task('1', 'Saved from before', 'pending'), [`${dir}/2.json`]: '{oops' })
  const clock = mock.clock(on)
  mock.store(on)
  boot(on)
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: false })
  await clock.advance(10)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-plan' })
  expect(await ui.find({ text: /Saved from before/ })).toBeDefined()
  files[`${dir}/1.json`] = task('1', 'Renamed on disk', 'in_progress')
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 'u1', taskId: '1', status: 'in_progress' } as never)
  await clock.advance(400)
  await ui.redraw()
  expect(await ui.find({ text: /Renamed on disk/ })).toBeDefined()
  await ui.unmount()
})

test('CLAUDE_CODE_TASK_LIST_ID picks the list, and a subagent TaskUpdate does not reload', { timeoutMs: 20000 }, async ($, on) => {
  const dir = '/fake/.claude/tasks/mine'
  const { files } = fakeFs(on, { [`${dir}/1.json`]: task('1', 'From the named list', 'pending') }, undefined, { CLAUDE_CODE_TASK_LIST_ID: 'mine' })
  const clock = mock.clock(on)
  mock.store(on)
  boot(on)
  await $.session.start({ cwd: '/elsewhere', surface: 'terminal', isInteractive: false })
  await clock.advance(10)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-plan' })
  expect(await ui.find({ text: /From the named list/ })).toBeDefined()
  files[`${dir}/1.json`] = task('1', 'Changed by a subagent', 'pending')
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 'u2', agentId: 'sub', taskId: '1', status: 'pending' } as never)
  await clock.advance(400)
  await ui.redraw()
  expect(await ui.find({ text: /Changed by a subagent/ })).toBeUndefined()
  await ui.unmount()
})
