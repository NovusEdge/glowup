// JSX-free: the studio imports it.

export type Level = { level: number; into: number; need: number }

export const xpToReach = (level: number) => 50 * level * (level - 1)

export const levelOf = (xp: number): Level => {
  const x = Math.max(0, xp)
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + x / 12.5)) / 2))
  // The closed form drifts at exact boundaries in floating point.
  while (xpToReach(level) > x) level--
  while (xpToReach(level + 1) <= x) level++
  return { level, into: x - xpToReach(level), need: 100 * level }
}

export type TurnXp = { answered: boolean; combo: number; green: number; commits: number }

export const turnXp = (t: TurnXp) =>
  (t.answered ? 5 + Math.min(t.combo, 20) : 0) + 15 * t.green + 10 * Math.min(t.commits, 3)

export const isCommitCommand = (command: string) =>
  command.split(/&&|;|\|\|?/).some(part => {
    const p = part.trim().replace(/^(\w+=\S+\s+)+/, '')
    return /^git\s+(-C\s+\S+\s+)?commit(\s|$)/.test(p) && !p.includes('--dry-run')
  })

export type UnlockKind = 'lines' | 'outfit' | 'idle'

export const UNLOCKS: readonly { level: number; kind: UnlockKind; label: string }[] = [
  { level: 2, kind: 'lines', label: 'new lines' },
  { level: 3, kind: 'outfit', label: 'a new outfit' },
  { level: 4, kind: 'lines', label: 'new lines' },
  { level: 5, kind: 'idle', label: 'a new move' },
  { level: 6, kind: 'outfit', label: 'a new outfit' },
  { level: 7, kind: 'lines', label: 'new lines' },
  { level: 8, kind: 'outfit', label: 'a new outfit' },
  { level: 10, kind: 'idle', label: 'a new move' },
]

export const unlocksBetween = (fromLevel: number, toLevel: number) =>
  UNLOCKS.filter(u => u.level > fromLevel && u.level <= toLevel)

export const ART_READY = false

export const levelUp = (beforeXp: number, afterXp: number): { level: number; unlock?: string } | undefined => {
  const from = levelOf(beforeXp).level
  const to = levelOf(afterXp).level
  if (to <= from) return undefined
  const shipped = unlocksBetween(from, to).filter(u => u.kind === 'lines' || ART_READY)
  return { level: to, unlock: shipped.at(-1)?.label }
}

export const parseLevelStore = (v: unknown): number => {
  const r = v as { format?: unknown; xp?: unknown } | null
  return r?.format === 1 && Number.isInteger(r.xp) && (r.xp as number) >= 0 ? (r.xp as number) : 0
}

export const levelStore = (xp: number) => ({ format: 1 as const, xp })

// Not toLocaleString: its output depends on the host's locale and ICU build.
export const groupDigits = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
