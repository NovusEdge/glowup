import { CLAWD_SHEET, stepPlayer, type PetSheet, type Player } from './data.ts'

export type PetMode = { kind: 'wander' } | { kind: 'pose'; pose: string }

const WALK_MS = 2400, IDLE_MS = 3000, REPLAY_REST_MS = 1500

// A play-once pose (hop, fail, scrunch) holds its last frame for as long as the pose lasts, so a card
// showing one alternates it with idle; otherwise it plays once at page load and freezes.
function cardPose(sheet: PetSheet, pose: string, now: number): string {
  const anim = sheet.animations[pose]
  if (!anim || anim.loop) return pose
  const ms = anim.frames.reduce((n, f) => n + f.ms, 0)
  return now % (ms + REPLAY_REST_MS) < ms ? pose : 'idle'
}

// Wander is a fixed walk/idle cycle keyed off `now`: no Math.random, so a given clock always
// gives the same pose and the tests stay stable.
export function petTick(p: Player, mode: PetMode, now: number, maxX: number, sheet: PetSheet = CLAWD_SHEET): void {
  const pose = mode.kind === 'pose' ? cardPose(sheet, mode.pose, now) : now % (WALK_MS + IDLE_MS) < WALK_MS ? 'walk' : 'idle'
  stepPlayer(p, sheet, pose, now, maxX)
}
