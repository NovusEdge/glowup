import { test, expect } from 'claude-code/testing'
import { parseNumstat, gitBase, refreshCounts } from '../hooks/changes.ts'
import { fakeHost } from './kit.ts'

test('parseNumstat reads counts, binary files and renames', async () => {
  const m = parseNumstat('3\t1\tsrc/a.ts\0-\t-\timg.png\0' + '2\t0\t\0src/old.ts\0src/new.ts\0' + '1\t1\tcafé.ts\0' + '4\t2\ta\tb.ts\0', '/r')
  expect(m.get('/r/src/a.ts')).toEqual({ add: 3, del: 1 })
  expect(m.get('/r/img.png')).toEqual({ add: 0, del: 0 })
  expect(m.get('/r/src/new.ts')).toEqual({ add: 2, del: 0 })
  expect(m.has('/r/src/old.ts')).toBe(false)
  expect(m.get('/r/café.ts')).toEqual({ add: 1, del: 1 })
  expect(m.get('/r/a\tb.ts')).toEqual({ add: 4, del: 2 })
  expect(m.size).toBe(5)
})

test('a rejecting git (not installed) is treated as no repo or unchanged counts', async () => {
  const { host } = fakeHost()
  const broken = { ...host, run: async () => { throw new Error('spawn git ENOENT') } }
  expect(await gitBase(broken, '/r')).toBeUndefined()
  const files = [{ path: '/r/a.ts', add: 1, del: 0, how: 'edit' as const, at: 1 }]
  expect(await refreshCounts(broken, files, { root: '/r', base: 'abc' })).toEqual(files)
})

test('gitBase is undefined outside a repo', async () => {
  const { host } = fakeHost()
  expect(await gitBase(host, '/r')).toBeUndefined()
})

test('refreshCounts prefers git numbers and keeps reads and non-git files', async () => {
  const { host } = fakeHost({ runs: {
    'git -C /r rev-parse --show-toplevel': { exitCode: 0, stdout: '/r\n' },
    'git -C /r rev-parse HEAD': { exitCode: 0, stdout: 'abc\n' },
    'git -C /r diff --numstat -z abc': { exitCode: 0, stdout: '5\t2\tsrc/a.ts\0' },
  } })
  const git = await gitBase(host, '/r')
  expect(git).toEqual({ root: '/r', base: 'abc' })
  const out = await refreshCounts(host, [
    { path: '/r/src/a.ts', add: 1, del: 1, how: 'edit', at: 3 },
    { path: '/r/t.ts', add: 0, del: 0, how: 'read', at: 2 },
    { path: '/elsewhere/x.ts', add: 4, del: 0, how: 'edit', at: 1 },
  ], git)
  expect(out.map(f => [f.path, f.add, f.del])).toEqual([['/r/src/a.ts', 5, 2], ['/r/t.ts', 0, 0], ['/elsewhere/x.ts', 4, 0]])
})

test('git failing mid-session keeps the previous counts', async () => {
  const { host } = fakeHost()
  const files = [{ path: '/r/a.ts', add: 1, del: 0, how: 'edit' as const, at: 1 }]
  expect(await refreshCounts(host, files, { root: '/r', base: 'abc' })).toEqual(files)
})

test('refreshCounts reports git numbers for files Claude only read (shell edits)', async () => {
  const { host } = fakeHost({ runs: { 'git -C /r diff --numstat -z abc': { exitCode: 0, stdout: '2\t1\tt.ts\0' } } })
  const out = await refreshCounts(host, [{ path: '/r/t.ts', add: 0, del: 0, how: 'read', at: 2 }], { root: '/r', base: 'abc' })
  expect(out.map(f => [f.path, f.add, f.del])).toEqual([['/r/t.ts', 2, 1]])
})
