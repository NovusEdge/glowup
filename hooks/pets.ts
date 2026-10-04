// JSX-free: the docs site imports it.
import { CLAWD_SHEET } from './sprites/clawd.ts'

export { CLAWD_SHEET }
export const CLAWD_COLOR = '#d77757'
export const SHINY_COLOR = '#f2c94c'
export type PetSetting = 'clawd' | 'clawd-shiny' | 'off'
export type PetId = Exclude<PetSetting, 'off'>
// 'fail' is optional in a sheet; without one it plays 'alert'.
export type Pose = 'idle' | 'walk' | 'hop' | 'alert' | 'done' | 'sleep' | 'fail'
export type PetSpan = { text: string; color: string; bg?: string }
export type PetInput = { working: boolean; needsYou: boolean; lastTest?: { passed: boolean; at: number }; doneAt?: number; doneOk?: boolean; actAt?: number }

// Pixel rows of single-char palette keys, '.' = transparent. Two pixel rows make one terminal row.
// head is [x, y] of the top-centre of the head, where outfits anchor; dx is horizontal travel in pixels.
// exit marks a neutral frame: a pose change may cut away from the animation there.
// hand is the artist's note on where a hand sits in wake-up frames; nothing draws from it.
export type PetFrame = { px: string[]; dx?: number; head?: [number, number]; exit?: boolean; hand?: [number, number] | null }
export type PetAnim = { loop: boolean; frames: (PetFrame & { ms: number })[] }
// A one-shot clip played between two animations; `from` and `to` are animation names or '*'.
export type PetClip = { from: string; to: string; frames: (PetFrame & { ms: number })[] }
// anchor is the point of the outfit grid that sits on the frame's head (slot "head", the default) or hand
export type PetOutfit = { slot?: 'head' | 'hand'; anchor: [number, number]; px: string[] }
export type PetSheet = {
  w: number
  h: number
  palette: Record<string, string>
  shiny?: Record<string, string>
  animations: Record<string, PetAnim>
  outfits?: Record<string, PetOutfit>
  transitions?: Record<string, PetClip>
}

export const PET_COLS = 24
export const PET_ROWS = 6
// hats rise up to 4 px above the canvas
export const OUTFIT_PAD = 4
// the compact pane drawer's one-row Clawd
export const CLAWD_ROW = '▐▛█▜▌'

const ALERT_MS = 1500, HOP_MS = 1200, DONE_MS = 1500
export const SLEEP_MS = 10 * 60_000
// the longest a pose change waits for an exit frame
export const EXIT_WAIT_MS = 300

export function petPose(p: PetInput, now: number): Pose {
  if (p.needsYou) return 'alert'
  const t = p.lastTest
  if (t && !t.passed && now - t.at <= ALERT_MS) return 'alert'
  if (t && t.passed && now - t.at <= HOP_MS) return 'hop'
  if (!p.working && p.doneOk && p.doneAt !== undefined && now - p.doneAt <= DONE_MS) return 'done'
  if (p.working) return 'walk'
  // 0 is initialModel's "nothing yet", not a real time
  return p.actAt !== undefined && p.actAt > 0 && now - p.actAt >= SLEEP_MS ? 'sleep' : 'idle'
}

export const shiny = (palette: Record<string, string>, tint: Record<string, string> = CLAWD_SHEET.shiny ?? {}): Record<string, string> => ({ ...palette, ...tint })
export const petPalette = (sheet: PetSheet, pet: PetId) => (pet === 'clawd-shiny' ? shiny(sheet.palette, sheet.shiny) : sheet.palette)

type Cell = { text: string; color?: string; bg?: string }

export function halfBlock(px: string[], palette: Record<string, string>): PetSpan[][] {
  const col = (k: string | undefined) => (k === undefined || k === '.' ? undefined : palette[k])
  const rows: PetSpan[][] = []
  for (let y = 0; y < px.length; y += 2) {
    const top = px[y]!, bot = px[y + 1] ?? ''
    const cells: Cell[] = []
    for (let x = 0; x < top.length; x++) {
      const t = col(top[x]), b = col(bot[x])
      if (!t && !b) cells.push({ text: ' ' })
      else if (t && !b) cells.push({ text: '▀', color: t })
      else if (!t && b) cells.push({ text: '▄', color: b })
      else if (t === b) cells.push({ text: '█', color: t })
      else cells.push({ text: '▀', color: t, bg: b })
    }
    // A blank takes the nearest color so it can join a neighbouring run; it never carries a bg.
    let last: string | undefined
    for (const c of cells) { if (c.color) last = c.color; else c.color = last }
    last = undefined
    for (let i = cells.length - 1; i >= 0; i--) { const c = cells[i]!; if (c.color) last = c.color; else c.color = last }
    const out: PetSpan[] = []
    for (const c of cells) {
      const color = c.color ?? '#000000'
      const prev = out.at(-1)
      if (prev && prev.color === color && prev.bg === c.bg) prev.text += c.text
      else out.push(c.bg ? { text: c.text, color, bg: c.bg } : { text: c.text, color })
    }
    rows.push(out)
  }
  return rows
}

export function frameAt(anim: { loop: boolean; frames: { ms: number }[] }, elapsedMs: number): number {
  const total = anim.frames.reduce((n, f) => n + f.ms, 0)
  if (total <= 0) return 0
  let t = anim.loop ? ((elapsedMs % total) + total) % total : Math.max(0, elapsedMs)
  for (let i = 0; i < anim.frames.length; i++) {
    if (t < anim.frames[i]!.ms) return i
    t -= anim.frames[i]!.ms
  }
  return anim.frames.length - 1
}

// A frame with the worn outfits on its head, as pixel rows; unknown names (such as the band's 'friday') are ignored.
export function composeFrame(sheet: PetSheet, fr: PetFrame, overlays: readonly string[], mirror: boolean): string[] {
  const worn = overlays.filter(n => sheet.outfits?.[n])
  const pad = worn.length ? OUTFIT_PAD : 0
  const g: string[][] = []
  for (let y = 0; y < pad; y++) g.push(Array<string>(sheet.w).fill('.'))
  for (const row of fr.px) g.push([...row])
  for (const name of worn) {
    const o = sheet.outfits![name]!
    // held items sit at the frame's hand, which defaults to four pixels below the head
    const at = o.slot === 'hand' ? fr.hand ?? (fr.head && [fr.head[0], fr.head[1] + 4]) : fr.head
    if (at) {
      const ox = at[0] - o.anchor[0], oy = at[1] - o.anchor[1] + pad
      o.px.forEach((row, j) => [...row].forEach((c, k) => {
        const x = ox + k, y = oy + j
        if (c !== '.' && g[y]?.[x] !== undefined) g[y]![x] = c
      }))
    }
  }
  if (mirror) g.forEach(r => r.reverse())
  return g.map(r => r.join(''))
}

// A typo in a palette key would otherwise draw as nothing.
export function validateSheet(sheet: PetSheet): void {
  const known = (k: string) => k === '.' || k in sheet.palette
  const rows = (where: string, px: string[], h: number) => {
    if (px.length !== h) throw new Error(`${where}: ${px.length} pixel rows, want ${h}`)
    for (const r of px) {
      if ([...r].length !== sheet.w) throw new Error(`${where}: a row is ${[...r].length} wide, want ${sheet.w}`)
      for (const k of r) if (!known(k)) throw new Error(`${where}: unknown palette key "${k}"`)
    }
  }
  for (const k of Object.keys(sheet.shiny ?? {})) if (!(k in sheet.palette)) throw new Error(`shiny: unknown palette key "${k}"`)
  for (const [name, a] of Object.entries(sheet.animations)) a.frames.forEach((f, i) => { if (!(f.ms > 0)) throw new Error(`${name}[${i}]: ms must be positive`); rows(`${name}[${i}]`, f.px, sheet.h) })
  for (const [name, c] of Object.entries(sheet.transitions ?? {})) c.frames.forEach((f, i) => { if (!(f.ms > 0)) throw new Error(`${name}[${i}]: ms must be positive`); rows(`transition ${name}[${i}]`, f.px, sheet.h) })
  for (const [name, o] of Object.entries(sheet.outfits ?? {})) if (o.slot !== undefined && o.slot !== 'head' && o.slot !== 'hand') throw new Error(`outfit ${name}: slot must be head or hand`)
  for (const [name, o] of Object.entries(sheet.outfits ?? {})) for (const r of o.px) for (const k of r) if (!known(k)) throw new Error(`outfit ${name}: unknown palette key "${k}"`)
}

// A missing animation falls back: fail to alert, anything else to idle.
export const animFor = (sheet: PetSheet, name: string): PetAnim => sheet.animations[name] ?? (name === 'fail' ? sheet.animations.alert : undefined) ?? sheet.animations.idle!

const clipMs = (c: { frames: { ms: number }[] }) => c.frames.reduce((n, f) => n + f.ms, 0)

type Named = { name: string; clip: PetClip }

// The clips played on the way from animation `from` to pose `to`, in order:
//  - a clip written for exactly that pair plays alone;
//  - otherwise a clip that leaves `from` for the rest pose (walk -> idle "stop", sleep -> idle "wake-up"),
//    unless the target is alert, which cuts in;
//  - then a clip any animation may enter `to` with ("*" -> sleep "lie-down", "*" -> alert "startle").
function clipsFor(sheet: PetSheet, from: string, to: string): Named[] {
  const all = Object.entries(sheet.transitions ?? {}).map(([name, clip]) => ({ name, clip }))
  const pair = all.find(c => c.clip.from === from && c.clip.to === to)
  if (pair) return [pair]
  const out: Named[] = []
  const leave = all.find(c => c.clip.from === from && c.clip.to === 'idle')
  if (leave && to !== 'alert') out.push(leave)
  const enter = all.find(c => c.clip.from === '*' && c.clip.to === to)
  if (enter) out.push(enter)
  return out
}

// What is on screen now: an animation (looped or held) or a transition clip, from `start` on.
type Seg = { pose: string; anim: PetAnim; start: number; fi: number; clip: boolean; name: string }
export type Player = { seg?: Seg; queue: Named[]; pending?: { pose: string; at: number }; x: number; dir: 1 | -1 }
export const newPlayer = (): Player => ({ queue: [], x: 0, dir: 1 })

// Facing left uses the sheet's own "<pose>-left" animation when it has one (its dx is already negative);
// otherwise the walk is mirrored and dx is signed by the player's direction.
const sideName = (sheet: PetSheet, pose: string, dir: number) => (dir < 0 && sheet.animations[`${pose}-left`] ? `${pose}-left` : pose)
const segOf = (sheet: PetSheet, pose: string, start: number, dir: number): Seg => {
  const name = sideName(sheet, pose, dir)
  return { pose, anim: animFor(sheet, name), start, fi: 0, clip: false, name }
}
const clipSeg = (pose: string, name: string, clip: PetClip, start: number): Seg => ({ pose, anim: { loop: false, frames: clip.frames }, start, fi: 0, clip: true, name })

// True when the frame must be flipped to face left: a left-facing walk with no hand-drawn left animation.
export const mirrored = (p: Player): boolean => p.dir < 0 && !!p.seg && !p.seg.clip && p.seg.pose === 'walk' && !p.seg.name.endsWith('-left')

// Walking x follows the dx of every frame entered, so a slow tick still covers the ground.
function travel(p: Player, s: Seg, t: number, maxX: number, sheet: PetSheet) {
  const idx = frameAt(s.anim, t - s.start), n = s.anim.frames.length
  while (s.fi !== idx) {
    s.fi = (s.fi + 1) % n
    const dx = s.anim.frames[s.fi]!.dx ?? 0
    if (!dx) continue
    p.x += dx * (s.name.endsWith('-left') ? 1 : p.dir)
    const before = p.dir
    if (p.x >= maxX) { p.x = maxX; p.dir = -1 } else if (p.x <= 0) { p.x = 0; p.dir = 1 }
    // the left and right walks share their timing, so the swap keeps the step
    const want = sideName(sheet, s.pose, p.dir), other = sheet.animations[want]
    if (p.dir !== before && !s.clip && want !== s.name && other && other.frames.length === n) { s.name = want; s.anim = other }
  }
  p.x = Math.max(0, Math.min(p.x, maxX))
}

// The last frame of an animation that plays once counts as an exit frame.
const isExit = (a: PetAnim, i: number) => !!a.frames[i]!.exit || (!a.loop && i === a.frames.length - 1)

// Earliest moment within EXIT_WAIT_MS of `since` that the animation shows an exit frame. An animation with
// none marked has nothing to wait for.
function exitAt(s: Seg, since: number): number {
  if (!s.anim.frames.some((_, i) => isExit(s.anim, i))) return since
  for (let t = since; t <= since + EXIT_WAIT_MS; t += 10) if (isExit(s.anim, frameAt(s.anim, t - s.start))) return t
  return since + EXIT_WAIT_MS
}

// Moves the player to `pose` as of `now`. A change waits for the next exit frame, then plays the clip
// between the two animations when the sheet has one; alert cuts in at once.
export function stepPlayer(p: Player, sheet: PetSheet, pose: string, now: number, maxX: number): void {
  if (!p.seg) p.seg = segOf(sheet, pose, now, p.dir)
  for (let guard = 0; guard < 4; guard++) {
    const s: Seg = p.seg
    if (s.clip) {
      const end: number = s.start + clipMs(s.anim)
      if (pose === 'alert' && s.pose !== 'alert') { travel(p, s, now, maxX, sheet); play(p, sheet, s.name, 'alert', now); continue }
      if (now < end) break
      travel(p, s, end, maxX, sheet)
      const next = p.queue.shift()
      p.seg = next ? clipSeg(pose, next.name, next.clip, end) : segOf(sheet, pose, end, p.dir)
      continue
    }
    if (s.pose === pose) { p.pending = undefined; break }
    if (pose === 'alert') { travel(p, s, now, maxX, sheet); play(p, sheet, s.name, pose, now); continue }
    if (p.pending?.pose !== pose) p.pending = { pose, at: exitAt(s, now) }
    const at = p.pending.at
    if (now < at) break
    travel(p, s, at, maxX, sheet)
    play(p, sheet, s.name, pose, at)
  }
  travel(p, p.seg, now, maxX, sheet)
}

// Starts the way from animation `from` to `pose` at time `at`: the first clip now, the rest queued.
function play(p: Player, sheet: PetSheet, from: string, pose: string, at: number) {
  p.pending = undefined
  p.queue = clipsFor(sheet, from, pose)
  const first = p.queue.shift()
  p.seg = first ? clipSeg(pose, first.name, first.clip, at) : segOf(sheet, pose, at, p.dir)
}

export function playerFrame(p: Player, now: number): PetFrame {
  const s = p.seg!
  return s.anim.frames[frameAt(s.anim, now - s.start)]!
}
