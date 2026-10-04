import { test, expect } from 'claude-code/testing'
import { parseNumstat, gitBase, refreshCounts } from '../hooks/changes.ts'
import { fakeHost } from './kit.ts'

test('parseNumstat reads counts, binary files and renames', async () => {
  const m = parseNumstat('3\t1\tsrc/a.ts\n-\t-\timg.png\n2\t0\tsrc/{old => new}.ts\n', '/r')
  expect(m.get('/r/src/a.ts')).toEqual({ add: 3, del: 1 })
  expect(m.get('/r/img.png')).toEqual({ add: 0, del: 0 })
  expect(m.get('/r/src/new.ts')).toEqual({ add: 2, del: 0 })
})

test('gitBase is undefined outside a repo', async () => {
  const { host } = fakeHost()
  expect(await gitBase(host, '/r')).toBeUndefined()
})

test('refreshCounts prefers git numbers and keeps reads and non-git files', async () => {
  const { host } = fakeHost({ runs: {
    'git -C /r rev-parse --show-toplevel': { exitCode: 0, stdout: '/r\n' },
    'git -C /r rev-parse HEAD': { exitCode: 0, stdout: 'abc\n' },
    'git -C /r diff --numstat abc': { exitCode: 0, stdout: '5\t2\tsrc/a.ts\n' },
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
  const { host } = fakeHost({ runs: { 'git -C /r diff --numstat abc': { exitCode: 0, stdout: '2\t1\tt.ts\n' } } })
  const out = await refreshCounts(host, [{ path: '/r/t.ts', add: 0, del: 0, how: 'read', at: 2 }], { root: '/r', base: 'abc' })
  expect(out.map(f => [f.path, f.add, f.del])).toEqual([['/r/t.ts', 2, 1]])
})
