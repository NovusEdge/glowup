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
async function run(host: Host, argv: string[]): Promise<RunResult | undefined> {
  try { return await host.run(argv) } catch { return undefined }
}

export async function gitBase(host: Host, cwd: string): Promise<{ root: string; base: string } | undefined> {
  const top = await run(host, ['git', '-C', cwd, 'rev-parse', '--show-toplevel'])
  if (!top || top.exitCode !== 0) return undefined
  const head = await run(host, ['git', '-C', cwd, 'rev-parse', 'HEAD'])
  if (!head || head.exitCode !== 0) return undefined
  return { root: top.stdout.trim(), base: head.stdout.trim() }
}

// Read files are included on purpose: a shell command can edit a file Claude only
// read, and mergeCounts promotes it to an edit when git reports changes.
// Untracked files are absent from `git diff`, so new files keep their own counts.
export async function refreshCounts(host: Host, files: FileTouch[], git: { root: string; base: string } | undefined): Promise<FileTouch[]> {
  if (!git || !files.some(f => f.path.startsWith(git.root + '/'))) return files
  const r = await run(host, ['git', '-C', git.root, 'diff', '--numstat', '-z', git.base])
  if (!r || r.exitCode !== 0) return files
  const counts = parseNumstat(r.stdout, git.root)
  return files.map(f => ({ ...f, ...counts.get(f.path) }))
}
