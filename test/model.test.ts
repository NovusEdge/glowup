import { test, expect } from 'claude-code/testing'
import { initialModel, applyEvent, bandVisible, isBusy, mergeCounts, type Ev } from '../hooks/model.ts'

const run = (evs: Ev[]) => evs.reduce(applyEvent, initialModel())

test('main-loop tools set the action; results update it', async () => {
  const m = run([
    { type: 'turn-start', at: 0 },
    { type: 'tool-start', at: 1, tool: 'Bash', toolUseId: 't1', input: { command: 'npm test' } },
    { type: 'tool-end', at: 2, tool: 'Bash', toolUseId: 't1', input: { command: 'npm test' }, isError: true, text: '2 failed, 12 passed' },
  ])
  expect(m.working).toBe(true)
  expect(m.act).toEqual({ glyph: '✗', label: '2 tests failed', tone: 'fail' })
})

test('a passing test run reports the count from Task 3', async () => {
  const m = run([
    { type: 'tool-start', at: 1, tool: 'Bash', toolUseId: 't1', input: { command: 'pnpm test' } },
    { type: 'tool-end', at: 2, tool: 'Bash', toolUseId: 't1', input: { command: 'pnpm test' }, isError: false, text: 'Tests  14 passed (14)' },
  ])
  expect(m.act).toEqual({ glyph: '✓', label: '14/14 tests passing', tone: 'pass' })
})

test('a non-test shell error gets no test reaction', async () => {
  const m = run([
    { type: 'tool-start', at: 1, tool: 'Bash', toolUseId: 't1', input: { command: 'ls nope' } },
    { type: 'tool-end', at: 2, tool: 'Bash', toolUseId: 't1', input: { command: 'ls nope' }, isError: true, text: 'No such file' },
  ])
  expect(m.act.label).toBe('Running ls nope')
})

test('subagent tool calls update that agent, never the main action', async () => {
  const m = run([
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a1', input: { description: 'Find tests', prompt: '' } },
    { type: 'agent-bind', toolUseId: 'a1', agentId: 'ag-9' },
    { type: 'tool-start', at: 2, tool: 'Read', toolUseId: 'r1', input: { file_path: '/r/src/nav.tsx' } },
    { type: 'tool-start', at: 3, tool: 'Grep', toolUseId: 'g1', agentId: 'ag-9', input: { pattern: 'redirect(' } },
  ])
  expect(m.act.label).toBe('Reading src/nav.tsx')
  expect(m.agents).toHaveLength(1)
  expect(m.agents[0]).toMatchObject({ key: 'a1', agentId: 'ag-9', name: 'Find tests', state: 'running', now: '⌕ Searching "redirect("' })
})

test('agent name prefers name, then subagent_type, then description; task stays the description', async () => {
  const m = run([
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a1', input: { name: 'scout', subagent_type: 'Explore', description: 'Find tests' } },
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a2', input: { subagent_type: 'Explore', description: 'Find docs' } },
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a3', input: { description: 'Find specs' } },
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a4', input: {} },
  ])
  expect(m.agents.map(a => [a.name, a.task])).toEqual([['scout', 'Find tests'], ['Explore', 'Find docs'], ['Find specs', 'Find specs'], ['agent', '']])
})

test('parallel agents keep their own lines whatever order they bind in', async () => {
  const m = run([
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a1', input: { description: 'one' } },
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a2', input: { description: 'two' } },
    { type: 'agent-bind', toolUseId: 'a2', agentId: 'ag-2' },
    { type: 'agent-bind', toolUseId: 'a1', agentId: 'ag-1' },
    { type: 'tool-start', at: 2, tool: 'Read', toolUseId: 'r2', agentId: 'ag-2', input: { file_path: '/r/two.ts' } },
    { type: 'tool-start', at: 3, tool: 'Read', toolUseId: 'r1', agentId: 'ag-1', input: { file_path: '/r/one.ts' } },
    { type: 'tool-start', at: 4, tool: 'Read', toolUseId: 'r3', agentId: 'ag-unknown', input: { file_path: '/r/x.ts' } },
  ])
  expect(m.agents.map(a => [a.name, a.agentId, a.now])).toEqual([['one', 'ag-1', '▸ Reading r/one.ts'], ['two', 'ag-2', '▸ Reading r/two.ts']])
  expect(m.act.label).toBe('Started subagent: two')
})

test('an agent is done when its own turn completes; the Agent call only brings tokens', async () => {
  // background: the Agent call returns at once and the agent keeps running
  let bg = run([
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a1', input: { description: 'Find tests', prompt: '' } },
    { type: 'agent-bind', toolUseId: 'a1', agentId: 'ag-1' },
    { type: 'tool-end', at: 2, tool: 'Agent', toolUseId: 'a1', input: {}, isError: false, text: 'Async agent launched' },
  ])
  expect(bg.agents[0]).toMatchObject({ state: 'running' })
  bg = applyEvent(bg, { type: 'agent-done', at: 9001, agentId: 'ag-1', tokens: 2500 })
  expect(bg.agents[0]).toMatchObject({ state: 'done', endedAt: 9001, tokens: 2500 })
  // foreground: the agent's turn completes, then the Agent call ends with its tokens
  const fg = run([
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a1', input: { description: 'Find tests', prompt: '' } },
    { type: 'agent-bind', toolUseId: 'a1', agentId: 'ag-1' },
    { type: 'agent-done', at: 9001, agentId: 'ag-1' },
    { type: 'tool-end', at: 9002, tool: 'Agent', toolUseId: 'a1', input: {}, isError: false, text: '', agentTokens: 4100 },
  ])
  expect(fg.agents[0]).toMatchObject({ state: 'done', endedAt: 9001, tokens: 4100 })
})

test('edits accumulate per file; reads are listed once; newest first', async () => {
  const m = run([
    { type: 'tool-end', at: 1, tool: 'Read', toolUseId: 'r', input: { file_path: '/r/t.ts' }, isError: false, text: '' },
    { type: 'tool-end', at: 2, tool: 'Edit', toolUseId: 'e1', input: { file_path: '/r/a.ts', old_string: 'x', new_string: 'y\nz' }, isError: false, text: '' },
    { type: 'tool-end', at: 3, tool: 'Edit', toolUseId: 'e2', input: { file_path: '/r/a.ts', old_string: 'q', new_string: 'w' }, isError: false, text: '' },
    { type: 'tool-end', at: 4, tool: 'Write', toolUseId: 'w', input: { file_path: '/r/new.ts', content: 'a\nb' }, isError: false, text: '', writeType: 'create' },
    { type: 'tool-end', at: 5, tool: 'Write', toolUseId: 'w2', input: { file_path: '/r/old.ts', content: 'c' }, isError: false, text: '', writeType: 'update' },
  ])
  expect(m.files.map(f => [f.path, f.how, f.add, f.del])).toEqual([['/r/old.ts', 'edit', 1, 0], ['/r/new.ts', 'new', 2, 0], ['/r/a.ts', 'edit', 3, 2], ['/r/t.ts', 'read', 0, 0]])
})

test('a notebook edit is an edit with no line counts', async () => {
  const m = run([
    { type: 'tool-end', at: 1, tool: 'NotebookEdit', toolUseId: 'n1', input: { notebook_path: '/r/a.ipynb', new_source: 'x' }, isError: false, text: '' },
  ])
  expect(m.files.map(f => [f.path, f.how, f.add, f.del])).toEqual([['/r/a.ipynb', 'edit', 0, 0]])
})

test('mergeCounts keeps files added after the git snapshot and adds files only git saw', async () => {
  const snap = run([{ type: 'tool-end', at: 1, tool: 'Edit', toolUseId: 'e1', input: { file_path: '/r/a.ts', old_string: 'x', new_string: 'y' }, isError: false, text: '' }])
  const refreshed = snap.files.map(f => ({ ...f, add: 5, del: 2 }))
  const later = applyEvent(snap, { type: 'tool-end', at: 2, tool: 'Write', toolUseId: 'w1', input: { file_path: '/r/b.ts', content: 'q' }, isError: false, text: '', writeType: 'create' })
  const m = mergeCounts(later, [...refreshed, { path: '/r/sed.ts', add: 9, del: 9, how: 'edit', at: 3 }])
  expect(m.files.map(f => [f.path, f.how, f.add, f.del])).toEqual([['/r/sed.ts', 'edit', 9, 9], ['/r/b.ts', 'new', 1, 0], ['/r/a.ts', 'edit', 5, 2]])
  // a later refresh leaves its first-seen time alone
  expect(mergeCounts(m, [{ path: '/r/sed.ts', add: 10, del: 9, how: 'edit', at: 7 }]).files[0]).toMatchObject({ path: '/r/sed.ts', add: 10, at: 3 })
})

test('failed edits do not count', async () => {
  const m = run([{ type: 'tool-end', at: 2, tool: 'Edit', toolUseId: 'e1', input: { file_path: '/r/a.ts', old_string: 'x', new_string: 'y' }, isError: true, text: 'not found' }])
  expect(m.files).toEqual([])
})

test('needs-you holds until that call ends, then the action comes back', async () => {
  let m = run([
    { type: 'turn-start', at: 0 },
    { type: 'tool-start', at: 1, tool: 'Bash', toolUseId: 'b1', input: { command: 'git push --force' } },
    { type: 'needs-you', at: 2, toolUseId: 'b1', what: 'approve git push --force' },
  ])
  expect(m.act).toEqual({ glyph: '!', label: 'Needs you: approve git push --force', tone: 'fail' })
  // a parallel call starting does not hide the question
  m = applyEvent(m, { type: 'tool-start', at: 3, tool: 'Read', toolUseId: 'r1', input: { file_path: '/r/a.ts' } })
  expect(m.act.label).toBe('Needs you: approve git push --force')
  m = applyEvent(m, { type: 'tool-end', at: 4, tool: 'Bash', toolUseId: 'b1', input: { command: 'git push --force' }, isError: false, text: '' })
  expect(m.needsYou).toBeUndefined()
  expect(m.act.label).toBe('Reading r/a.ts')
})

test('turn-done and band linger', async () => {
  let m = run([{ type: 'turn-start', at: 0 }])
  m = applyEvent(m, { type: 'turn-done', at: 100, reason: 'answer' })
  expect(m.working).toBe(false)
  expect(m.act).toEqual({ glyph: '✓', label: 'Done', tone: 'pass' })
  expect(bandVisible(m, 1500)).toBe(true)
  expect(bandVisible(m, 1601)).toBe(false)
})

test('an interrupted or failed turn is not reported as done', async () => {
  const end = (reason: 'aborted' | 'error' | 'refusal') => applyEvent(run([{ type: 'turn-start', at: 0 }]), { type: 'turn-done', at: 1, reason }).act
  expect(end('aborted')).toEqual({ glyph: '■', label: 'Interrupted', tone: 'dim' })
  expect(end('error')).toEqual({ glyph: '✗', label: 'Stopped', tone: 'fail' })
  expect(end('refusal')).toEqual({ glyph: '✗', label: 'Stopped', tone: 'fail' })
})

test('a running subagent keeps the model busy after the main turn ends', async () => {
  let m = run([
    { type: 'turn-start', at: 0 },
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a1', input: { description: 'scout' } },
    { type: 'agent-bind', toolUseId: 'a1', agentId: 'ag-1' },
    { type: 'turn-done', at: 2, reason: 'answer' },
  ])
  expect(isBusy(m)).toBe(true)
  expect(bandVisible(m, 1_000_000)).toBe(true)
  m = applyEvent(m, { type: 'agent-done', at: 3, agentId: 'ag-1' })
  expect(isBusy(m)).toBe(false)
})

test('plan follows TaskCreate and uses the result id', async () => {
  const m = run([
    { type: 'tool-end', at: 1, tool: 'TaskCreate', toolUseId: 'c1', input: { subject: 'Patch it', description: '' }, isError: false, text: '', resultTaskId: '7' },
    { type: 'tool-end', at: 2, tool: 'TaskUpdate', toolUseId: 'u1', input: { taskId: '7', status: 'in_progress' }, isError: false, text: '' },
  ])
  expect(m.plan).toEqual([{ id: '7', title: 'Patch it', status: 'in_progress' }])
})

test('a subagent todo list leaves the main plan alone', async () => {
  const m = run([
    { type: 'tool-end', at: 1, tool: 'TodoWrite', toolUseId: 'p1', input: { todos: [{ content: 'Main', status: 'pending' }] }, isError: false, text: '' },
    { type: 'tool-end', at: 2, tool: 'TodoWrite', toolUseId: 'p2', agentId: 'ag-1', input: { todos: [{ content: 'Sub', status: 'pending' }] }, isError: false, text: '' },
  ])
  expect(m.plan).toEqual([{ id: '0', title: 'Main', status: 'pending' }])
})

test('mergeCounts promotes a read file that git shows changed', async () => {
  const snap = run([
    { type: 'tool-end', at: 1, tool: 'Read', toolUseId: 'r1', input: { file_path: '/r/a.ts' }, isError: false, text: '' },
    { type: 'tool-end', at: 2, tool: 'Read', toolUseId: 'r2', input: { file_path: '/r/b.ts' }, isError: false, text: '' },
  ])
  const m = mergeCounts(snap, [
    { path: '/r/a.ts', add: 3, del: 1, how: 'edit', at: 0 },
    { path: '/r/b.ts', add: 0, del: 0, how: 'edit', at: 0 },
  ])
  expect(m.files.map(f => [f.path, f.how, f.add, f.del])).toEqual([['/r/b.ts', 'read', 0, 0], ['/r/a.ts', 'edit', 3, 1]])
})

test('mergeCounts keeps a new file new', async () => {
  const snap = run([{ type: 'tool-end', at: 1, tool: 'Write', toolUseId: 'w', input: { file_path: '/r/n.ts', content: 'a' }, isError: false, text: '', writeType: 'create' }])
  expect(mergeCounts(snap, [{ path: '/r/n.ts', add: 4, del: 0, how: 'new', at: 0 }]).files[0]).toMatchObject({ how: 'new', add: 4 })
})

test('a failed Agent call ends that agent', async () => {
  const m = run([
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a1', input: { description: 'one' } },
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a2', input: { description: 'two' } },
    { type: 'tool-end', at: 5, tool: 'Agent', toolUseId: 'a1', input: {}, isError: true, text: 'denied' },
  ])
  expect(m.agents.map(a => [a.name, a.state, a.endedAt])).toEqual([['one', 'done', 5], ['two', 'running', undefined]])
})
