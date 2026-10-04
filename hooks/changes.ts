import type { Host, RunResult } from './host.ts'
import type { FileTouch } from './model.ts'

// Input is `git diff --numstat -z`: NUL-terminated records, paths unquoted.
// A rename is "add\tdel\t\0old\0new\0"; the new path is the one that counts.
export function parseNumstat(out: string, root: string): Map<string, { add: number; del: number }> {
  const m = new Map<string, { add: number; del: number }>()
  const parts = out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i]!
    const t1 = rec.indexOf('\t')
    const t2 = rec.indexOf('\t', t1 + 1)
    if (t1 < 0 || t2 < 0) continue
    let path = rec.slice(t2 + 1)
    if (path === '') { path = parts[i + 2] ?? ''; i += 2 }
    if (path === '') continue
    m.set(`${root}/${path}`, { add: Number(rec.slice(0, t1)) || 0, del: Number(rec.slice(t1 + 1, t2)) || 0 })
  }
  return m
}

// A missing git binary rejects instead of returning a non-zero exit code.
// Without --no-optional-locks, `git diff` rewrites a stale index under
// .git/index.lock, and Claude's own `git commit` at that moment fails.
async function git(host: Host, dir: string, args: string[], env?: Record<string, string>): Promise<RunResult | undefined> {
  try { return await host.run(['git', '--no-optional-locks', '-C', dir, ...args], env) } catch { return undefined }
}
async function run(host: Host, argv: string[]): Promise<RunResult | undefined> {
  try { return await host.run(argv) } catch { return undefined }
}

// The base is the working tree as the session found it (`stash create` writes a
// commit object and no stash entry), so edits made before the session stay out.
// The root keeps the cwd's spelling: through a symlink, --show-toplevel gives the
// real path, which never matches the paths Claude's tools report.
export async function gitBase(host: Host, cwd: string): Promise<{ root: string; base: string } | undefined> {
  const r = await git(host, cwd, ['rev-parse', '--show-toplevel', '--show-prefix', '--git-path', 'index', 'HEAD'])
  if (!r || r.exitCode !== 0) return undefined
  const [top = '', prefix = '', indexPath = '', head = ''] = r.stdout.split('\n')
  const dir = cwd.replace(/\/+$/, '')
  const sub = prefix.replace(/\/$/, '')
  const root = !sub ? dir : dir.endsWith('/' + sub) ? dir.slice(0, -sub.length - 1) : top
  // --git-path is relative to the directory rev-parse ran in
  const index = indexPath.startsWith('/') ? indexPath : `${dir}/${indexPath}`
  return { root, base: (await worktreeCommit(host, root, index)) ?? head.trim() }
}

// symbolic-ref fails on a detached HEAD, which then shows no branch
export async function branchOf(host: Host, dir: string): Promise<string | undefined> {
  const r = await git(host, dir, ['symbolic-ref', '--short', '-q', 'HEAD'])
  return r && r.exitCode === 0 && r.stdout.trim() ? r.stdout.trim() : undefined
}

// `stash create` refreshes the index it reads, under its .lock, even with
// --no-optional-locks: on the real index that clashes with Claude's own git
// commit. A throwaway copy takes that lock instead.
async function worktreeCommit(host: Host, root: string, index: string): Promise<string | undefined> {
  const tmp = (await run(host, ['mktemp']))?.stdout.trim()
  if (!tmp) return undefined
  try {
    if ((await run(host, ['cp', index, tmp]))?.exitCode !== 0) return undefined
    const r = await git(host, root, ['stash', 'create'], { GIT_INDEX_FILE: tmp })
    return r?.exitCode === 0 && r.stdout.trim() ? r.stdout.trim() : undefined
  } finally {
    await run(host, ['rm', '-f', tmp])
  }
}

// Files git reports that Claude never edited (sed -i, a file it only read, the person's
// editor) join as edits.
// Untracked files are absent from `git diff`, so new files keep their own counts.
export async function refreshCounts(host: Host, files: FileTouch[], repo: { root: string; base: string } | undefined, at: number): Promise<FileTouch[]> {
  if (!repo) return files
  const r = await git(host, repo.root, ['diff', '--numstat', '-z', repo.base])
  if (!r || r.exitCode !== 0) return files
  const counts = parseNumstat(r.stdout, repo.root)
  const known = new Set(files.map(f => f.path))
  const extra = [...counts].filter(([path]) => !known.has(path)).map(([path, c]): FileTouch => ({ path, ...c, how: 'edit', at }))
  return [...files.map(f => ({ ...f, ...counts.get(f.path) })), ...extra]
}

// One git process at a time: a call while a job runs marks the queue dirty, and
// exactly one more job (the latest) runs when the current one settles.
export function serial(): (job: () => Promise<void>) => void {
  let busy = false
  let next: (() => Promise<void>) | undefined
  const start = (job: () => Promise<void>) => {
    busy = true
    void job().catch(() => {}).finally(() => {
      busy = false
      const queued = next
      next = undefined
      if (queued) start(queued)
    })
  }
  return job => { if (busy) next = job; else start(job) }
}
