import { test, expect } from 'claude-code/testing'
import { parseNumstat, gitBase, branchOf, refreshCounts, serial } from '../hooks/changes.ts'
import { fakeHost } from './kit.ts'

const REV = 'git --no-optional-locks -C /r rev-parse --show-toplevel --show-prefix --git-path index HEAD'
const STASH = 'git --no-optional-locks -C /r stash create'
const DIFF = 'git --no-optional-locks -C /r diff --numstat -z abc'
// rev-parse prints --git-path relative to the directory it ran in
const REV_OUT = '/r\n\n.git/index\nabc\n'
const COPY = { 'mktemp': { exitCode: 0, stdout: '/tmp/idx.1\n' }, 'cp /r/.git/index /tmp/idx.1': { exitCode: 0, stdout: '' }, 'rm -f /tmp/idx.1': { exitCode: 0, stdout: '' } }

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
  expect(await refreshCounts(broken, files, { root: '/r', base: 'abc' }, 9)).toEqual(files)
})

test('gitBase is undefined outside a repo', async () => {
  const { host } = fakeHost()
  expect(await gitBase(host, '/r')).toBeUndefined()
})

test('branchOf names the branch, and nothing when detached or outside git', async () => {
  const argv = 'git --no-optional-locks -C /w symbolic-ref --short -q HEAD'
  expect(await branchOf(fakeHost({ runs: { [argv]: { exitCode: 0, stdout: 'main\n' } } }).host, '/w')).toBe('main')
  expect(await branchOf(fakeHost({ runs: { [argv]: { exitCode: 1, stdout: '' } } }).host, '/w')).toBeUndefined()
  expect(await branchOf(fakeHost().host, '/w')).toBeUndefined()
})

test('every git call skips optional locks so Claude\'s own git commit never meets index.lock', async () => {
  const { host, ran } = fakeHost({ runs: {
    [REV]: { exitCode: 0, stdout: REV_OUT },
    ...COPY,
    [STASH]: { exitCode: 0, stdout: '' },
    [DIFF]: { exitCode: 0, stdout: '' },
  } })
  const git = await gitBase(host, '/r')
  await refreshCounts(host, [], git, 9)
  const gits = ran.filter(a => a.startsWith('git '))
  expect(gits.length).toBe(3)
  for (const argv of gits) expect(argv.startsWith('git --no-optional-locks -C ')).toBe(true)
})

test('stash create runs on a throwaway copy of the index, never .git/index itself', async () => {
  const { host, ran, envs } = fakeHost({ runs: { [REV]: { exitCode: 0, stdout: REV_OUT }, ...COPY, [STASH]: { exitCode: 0, stdout: 'f00d\n' } } })
  expect(await gitBase(host, '/r')).toEqual({ root: '/r', base: 'f00d' })
  expect(ran).toEqual([REV, 'mktemp', 'cp /r/.git/index /tmp/idx.1', STASH, 'rm -f /tmp/idx.1'])
  expect(envs[ran.indexOf(STASH)]).toEqual({ GIT_INDEX_FILE: '/tmp/idx.1' })
})

test('the baseline is the session-start working tree when it is dirty, else HEAD', async () => {
  const dirty = fakeHost({ runs: { [REV]: { exitCode: 0, stdout: REV_OUT }, ...COPY, [STASH]: { exitCode: 0, stdout: 'f00d\n' } } })
  expect(await gitBase(dirty.host, '/r')).toEqual({ root: '/r', base: 'f00d' })
  const clean = fakeHost({ runs: { [REV]: { exitCode: 0, stdout: REV_OUT }, ...COPY, [STASH]: { exitCode: 0, stdout: '' } } })
  expect(await gitBase(clean.host, '/r')).toEqual({ root: '/r', base: 'abc' })
})

test('with no index to copy (fresh repo) the baseline is HEAD and stash create never runs', async () => {
  const { host, ran } = fakeHost({ runs: { [REV]: { exitCode: 0, stdout: REV_OUT }, mktemp: COPY.mktemp, 'rm -f /tmp/idx.1': COPY['rm -f /tmp/idx.1'] } })
  expect(await gitBase(host, '/r')).toEqual({ root: '/r', base: 'abc' })
  expect(ran).not.toContain(STASH)
  expect(ran).toContain('rm -f /tmp/idx.1')
})

test('the root keeps the cwd spelling, so a symlinked checkout matches tool paths', async () => {
  const { host } = fakeHost({ runs: {
    'git --no-optional-locks -C /link/sub/dir rev-parse --show-toplevel --show-prefix --git-path index HEAD': { exitCode: 0, stdout: '/real/repo\nsub/dir/\n/real/repo/.git/index\nabc\n' },
    ...COPY,
    'cp /real/repo/.git/index /tmp/idx.1': { exitCode: 0, stdout: '' },
    'git --no-optional-locks -C /link stash create': { exitCode: 0, stdout: '' },
  } })
  expect(await gitBase(host, '/link/sub/dir')).toEqual({ root: '/link', base: 'abc' })
})

test('refreshCounts prefers git numbers, keeps reads and non-git files, and adds shell-edited files', async () => {
  const { host } = fakeHost({ runs: { [DIFF]: { exitCode: 0, stdout: '5\t2\tsrc/a.ts\0' + '1\t1\tsed.ts\0' } } })
  const out = await refreshCounts(host, [
    { path: '/r/src/a.ts', add: 1, del: 1, how: 'edit', at: 3 },
    { path: '/r/t.ts', add: 0, del: 0, how: 'read', at: 2 },
    { path: '/elsewhere/x.ts', add: 4, del: 0, how: 'edit', at: 1 },
  ], { root: '/r', base: 'abc' }, 9)
  expect(out.map(f => [f.path, f.how, f.add, f.del, f.at])).toEqual([
    ['/r/src/a.ts', 'edit', 5, 2, 3], ['/r/t.ts', 'read', 0, 0, 2], ['/elsewhere/x.ts', 'edit', 4, 0, 1], ['/r/sed.ts', 'edit', 1, 1, 9],
  ])
})

test('refreshCounts runs git even when Claude has touched no file yet', async () => {
  const { host } = fakeHost({ runs: { [DIFF]: { exitCode: 0, stdout: '2\t0\tx.ts\0' } } })
  expect(await refreshCounts(host, [], { root: '/r', base: 'abc' }, 5)).toEqual([{ path: '/r/x.ts', add: 2, del: 0, how: 'edit', at: 5 }])
})

test('git failing mid-session keeps the previous counts', async () => {
  const { host } = fakeHost()
  const files = [{ path: '/r/a.ts', add: 1, del: 0, how: 'edit' as const, at: 1 }]
  expect(await refreshCounts(host, files, { root: '/r', base: 'abc' }, 9)).toEqual(files)
})

test('refreshCounts reports git numbers for files Claude only read (shell edits)', async () => {
  const { host } = fakeHost({ runs: { [DIFF]: { exitCode: 0, stdout: '2\t1\tt.ts\0' } } })
  const out = await refreshCounts(host, [{ path: '/r/t.ts', add: 0, del: 0, how: 'read', at: 2 }], { root: '/r', base: 'abc' }, 9)
  expect(out.map(f => [f.path, f.add, f.del])).toEqual([['/r/t.ts', 2, 1]])
})

test('serial runs one job at a time and only one more after a burst', async () => {
  const queue = serial()
  let running = 0, most = 0, runs = 0
  const gates: (() => void)[] = []
  const job = () => new Promise<void>(resolve => {
    running++; runs++; most = Math.max(most, running)
    gates.push(() => { running--; resolve() })
  })
  for (let i = 0; i < 5; i++) queue(job)
  expect(runs).toBe(1)
  gates.shift()!()
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  expect(runs).toBe(2)
  gates.shift()!()
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  expect(runs).toBe(2)
  expect(most).toBe(1)
  // a rejecting job does not wedge the queue
  queue(() => Promise.reject(new Error('git died')))
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  queue(job)
  expect(runs).toBe(3)
})
