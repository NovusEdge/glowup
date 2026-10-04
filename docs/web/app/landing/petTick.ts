import { CLAWD_SHEET, stepPlayer, type Player } from './data.ts'

export type PetMode = { kind: 'wander' } | { kind: 'pose'; pose: string }

const WALK_MS = 2400, IDLE_MS = 3000

// Wander is a fixed walk/idle cycle keyed off `now`: no Math.random, so a given clock always
// gives the same pose and the tests stay stable.
export function petTick(p: Player, mode: PetMode, now: number, maxX: number): void {
  const pose = mode.kind === 'pose' ? mode.pose : now % (WALK_MS + IDLE_MS) < WALK_MS ? 'walk' : 'idle'
  stepPlayer(p, CLAWD_SHEET, pose, now, maxX)
}
