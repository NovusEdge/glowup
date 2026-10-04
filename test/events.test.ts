import { test, expect } from 'claude-code/testing'
import { describeTool, isTestCommand, testOutcome, planFrom, editCounts, shortPath } from '../hooks/events.ts'

test('tool kinds and labels', async () => {
  expect(describeTool('Read', { file_path: '/r/src/auth.ts' })).toMatchObject({ kind: 'read', label: 'Reading src/auth.ts', file: '/r/src/auth.ts' })
  expect(describeTool('Grep', { pattern: 'redirect' })).toMatchObject({ kind: 'search', label: 'Searching "redirect"' })
  expect(describeTool('Glob', { pattern: '**/*.ts' }).kind).toBe('search')
  expect(describeTool('Edit', { file_path: '/r/a.ts', old_string: 'x', new_string: 'y' })).toMatchObject({ kind: 'edit', label: 'Editing r/a.ts' })
  expect(describeTool('Write', { file_path: '/r/b.ts', content: 'z' }).kind).toBe('edit')
  expect(describeTool('Bash', { command: 'npm test' })).toMatchObject({ kind: 'shell', isTest: true, label: 'Running npm test' })
  expect(describeTool('Agent', { description: 'Find tests', prompt: '...' })).toMatchObject({ kind: 'agent', label: 'Started subagent: Find tests' })
  expect(describeTool('TodoWrite', { todos: [] }).kind).toBe('plan')
  expect(describeTool('mcp__x__y', {}).kind).toBe('other')
})

test('labels shorten long paths to the last two segments', async () => {
  expect(describeTool('Read', { file_path: '/very/long/path/to/src/auth.ts' }).label).toBe('Reading src/auth.ts')
  expect(shortPath('/very/long/path/to/src/auth.ts')).toBe('src/auth.ts')
})

test('test commands are recognized, others are not', async () => {
  for (const c of ['npm test', 'npm run test:unit', 'npm run tests', 'pnpm run tests', 'yarn run tests', 'bun run tests', 'pnpm test', 'yarn test', 'bun test', 'pytest -x', 'python -m pytest', 'go test ./...', 'cargo test', 'npx vitest run', 'jest', 'mix test', 'rspec', 'make test', 'gradle test', './gradlew test', 'mvn test', 'cd web && pnpm test'])
    expect(isTestCommand(c)).toBe(true)
  for (const c of ['npm install', 'git status', 'cat test.txt', 'ls tests/', 'echo test'])
    expect(isTestCommand(c)).toBe(false)
})

test('test outcome reads error flag and common summaries', async () => {
  expect(testOutcome('Tests: 2 failed, 12 passed, 14 total', true)).toEqual({ passed: false, summary: '2 tests failed' })
  expect(testOutcome('14 passed in 1.2s', false)).toEqual({ passed: true, summary: '14/14 tests passing' })
  expect(testOutcome('ok  	pkg	0.01s', false)).toEqual({ passed: true, summary: 'tests passing' })
  expect(testOutcome('', true)).toEqual({ passed: false, summary: 'tests failed' })
})

test('plan from TodoWrite replaces the list', async () => {
  const plan = planFrom('TodoWrite', { todos: [{ content: 'A', status: 'completed', activeForm: 'a' }, { content: 'B', status: 'in_progress', activeForm: 'b' }] }, [])
  expect(plan).toEqual([{ id: '0', title: 'A', status: 'completed' }, { id: '1', title: 'B', status: 'in_progress' }])
})

test('plan from TaskCreate appends and TaskUpdate changes status', async () => {
  let plan = planFrom('TaskCreate', { subject: 'A', description: '' }, [], '1')!
  plan = planFrom('TaskCreate', { subject: 'B', description: '' }, plan, '2')!
  plan = planFrom('TaskUpdate', { taskId: '1', status: 'completed' }, plan)!
  expect(plan.map(p => [p.id, p.title, p.status])).toEqual([['1', 'A', 'completed'], ['2', 'B', 'pending']])
  expect(planFrom('TaskUpdate', { taskId: '2', status: 'deleted' }, plan)!.length).toBe(1)
  expect(planFrom('Read', {}, plan)).toBeUndefined()
})

test('TaskCreate takes the result id, and counts on only when there is none', async () => {
  expect(planFrom('TaskCreate', { subject: 'C' }, [], '9')![0]!.id).toBe('9')
  expect(planFrom('TaskCreate', { subject: 'D' }, [{ id: '9', title: 'C', status: 'pending' }])![1]!.id).toBe('10')
})

test('edit counts from tool input', async () => {
  expect(editCounts('Edit', { old_string: 'a\nb', new_string: 'a\nc\nd' })).toEqual({ add: 3, del: 2 })
  expect(editCounts('Write', { content: 'x\ny\n' })).toEqual({ add: 2, del: 0 })
  expect(editCounts('Read', {})).toBeUndefined()
})
