import { SAFE_NAME } from './packs.ts'

export const REMOTE_DIR = (configDir: string) => `${configDir}/glowup/remote`

export type RemoteLine = { seq: number; cmds: string[] } | { seq: number; undo: true }

// What the config TUI may run. A Write steered into commands.jsonl can change the look and
// nothing else: no URLs or files to install, no settings.json rewrite, no windows.
export function allowed(cmd: string): boolean {
  const w = cmd.trim().split(/\s+/)
  switch (w[0]) {
    case 'pack': return w.length === 2 && SAFE_NAME.test(w[1]!)
    case 'spinner': case 'motion': case 'bubbles': return w.length === 2
    case 'pet': return w.length === 2 && w[1] !== 'add' && w[1] !== 'list'
    case 'color': return w.length === 3
    case 'setup': return w.length >= 3 && w[1] !== 'reset'
    case 'statusline': return w[1] === 'fields' && w.length >= 3
    default: return false
  }
}

function parseLine(s: string): RemoteLine | undefined {
  try {
    const v = JSON.parse(s) as Record<string, unknown>
    if (typeof v.seq !== 'number' || !Number.isInteger(v.seq)) return undefined
    if (v.undo === true) return { seq: v.seq, undo: true }
    if (Array.isArray(v.cmds) && v.cmds.length > 0 && v.cmds.every(c => typeof c === 'string')) return { seq: v.seq, cmds: v.cmds as string[] }
  } catch {}
  return undefined
}

// A line the TUI is still writing has no newline yet, so it is left for the next poll.
export function newLines(text: string, consumed: number): { lines: (RemoteLine | undefined)[]; consumed: number } {
  const done = text.slice(0, text.lastIndexOf('\n') + 1).split('\n').slice(0, -1)
  return { lines: done.slice(consumed).map(parseLine), consumed: Math.max(consumed, done.length) }
}
