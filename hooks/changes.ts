import type { Host } from './host.ts'
import type { FileTouch } from './model.ts'

export function parseNumstat(out: string, root: string): Map<string, { add: number; del: number }> {
  const m = new Map<string, { add: number; del: number }>()
  for (const line of out.split('\n')) {
    const [a, d, ...rest] = line.split('\t')
    if (!rest.length) continue
    // "src/{old => new}.ts" and "old => new" both name the new path
    const path = rest.join('\t').replace(/\{[^}]*=> ([^}]*)\}/, '$1').replace(/^.* => /, '')
    m.set(`${root}/${path}`, { add: Number(a) || 0, del: Number(d) || 0 })
  }
  return m
}

export async function gitBase(host: Host, cwd: string): Promise<{ root: string; base: string } | undefined> {
  const top = await host.run(['git', '-C', cwd, 'rev-parse', '--show-toplevel'])
  if (top.exitCode !== 0) return undefined
  const head = await host.run(['git', '-C', cwd, 'rev-parse', 'HEAD'])
  if (head.exitCode !== 0) return undefined
  return { root: top.stdout.trim(), base: head.stdout.trim() }
}

// Read files are included on purpose: a shell command can edit a file Claude only
// read, and mergeCounts promotes it to an edit when git reports changes.
// Untracked files are absent from `git diff`, so new files keep their own counts.
export async function refreshCounts(host: Host, files: FileTouch[], git: { root: string; base: string } | undefined): Promise<FileTouch[]> {
  if (!git || !files.some(f => f.path.startsWith(git.root + '/'))) return files
  const r = await host.run(['git', '-C', git.root, 'diff', '--numstat', git.base])
  if (r.exitCode !== 0) return files
  const counts = parseNumstat(r.stdout, git.root)
  return files.map(f => ({ ...f, ...counts.get(f.path) }))
}
