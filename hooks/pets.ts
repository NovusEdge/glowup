// JSX-free: the docs site imports it.
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
export type PetFrame = { px: string[]; dx?: number; head?: [number, number] }
export type PetSheet = {
  w: number
  h: number
  palette: Record<string, string>
  animations: Record<string, { loop: boolean; frames: (PetFrame & { ms: number })[] }>
}

export const PET_COLS = 24
export const PET_ROWS = 6
// the compact pane drawer's one-row Clawd
export const CLAWD_ROW = '▐▛█▜▌'

const ALERT_MS = 1500, HOP_MS = 1200, DONE_MS = 1500
export const SLEEP_MS = 10 * 60_000

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

const GOLD = { o: SHINY_COLOR, h: '#ffe68f', s: '#c4941a', K: '#2a1d05', W: '#ffffff' }
const CLAWD_PAL = { o: CLAWD_COLOR, h: '#ee9f7b', s: '#a8553b', K: '#1b1214', W: '#fff4ec' }
// effects and outfit colors, shared by both palettes
export const FX: Record<string, string> = {
  '!': '#ff6b80', z: '#aab0c8', Z: '#6f7590', g: '#26262e', d: '#55555f', r: '#e5484d', R: '#ffffff',
  p: '#c86bff', P: '#ffd166', n: '#6c7cff', N: '#dfe3ff', u: '#ff8c1a', U: '#3f8f3a', b: '#7dc4e4',
  '1': '#ff6b80', '2': '#ffd166', '3': '#4eba65', '4': '#7dc4e4', '5': '#c86bff', '*': '#ffe68f',
}

export const shiny = (palette: Record<string, string>): Record<string, string> => ({ ...palette, ...GOLD })

type Cell = { text: string; color?: string; bg?: string }

export function halfBlock(px: string[], palette: Record<string, string>, fx: Record<string, string> = FX): PetSpan[][] {
  const col = (k: string | undefined) => (k === undefined || k === '.' ? undefined : palette[k] ?? fx[k])
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

// Procedural drawing of Clawd, ported from mockups/clawd-motion.html onto a 24x12 canvas. A hand-drawn
// sheet can replace CLAWD_SHEET without touching anything else: it only has to be a PetSheet.
const SW = 24, SH = 12
const GROUND = 10 // feet rest on this row; row 11 holds the shadow
const CX = 12

type Grid = (string | null)[][]
const newGrid = (): Grid => Array.from({ length: SH }, () => Array<string | null>(SW).fill(null))
const put = (g: Grid, x: number, y: number, c: string) => {
  x = Math.round(x); y = Math.round(y)
  if (y >= 0 && y < SH && x >= 0 && x < SW) g[y]![x] = c
}

type Body = { top: number; left: number; right: number; bottom: number; mid: number }
type Look = { lift?: number; sq?: number; eyes?: string; look?: number; arms?: string | [string, string]; step?: number; face?: number; cx?: number }

// lift = pixels above the ground; sq > 0 squashes, < 0 stretches
function body(g: Grid, { cx = CX, lift = 0, sq = 0, eyes = 'open', look = 0, arms = 'down', step = -1, face = 1 }: Look): Body {
  const w = 14 + sq * 2, h = 7 - sq
  const legLen = lift > 0 ? 1 : 2
  const bottom = GROUND - legLen - Math.round(lift)
  const top = bottom - h + 1
  const left = Math.round(cx - w / 2), right = left + w - 1
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    if ((y === top || y === bottom) && (x === left || x === right)) continue
    put(g, x, y, y === top ? 'h' : y === bottom ? 's' : x === left ? 'h' : x === right ? 's' : 'o')
  }
  const ey = top + 2, mid = Math.round((left + right) / 2)
  for (const ex of [mid - 4 + look, mid + 3 + look]) {
    const r = ex > mid ? 1 : 0
    if (eyes === 'open') { put(g, ex, ey, 'W'); put(g, ex + 1, ey, 'K'); for (const yy of [ey + 1, ey + 2]) { put(g, ex, yy, 'K'); put(g, ex + 1, yy, 'K') } }
    if (eyes === 'blink' || eyes === 'shut') { put(g, ex, ey + 2, 'K'); put(g, ex + 1, ey + 2, 'K') }
    if (eyes === 'happy') { put(g, ex - 1 + r, ey + 1, 'K'); put(g, ex + r, ey, 'K'); put(g, ex + 1 + r, ey + 1, 'K') }
    if (eyes === 'wide') for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) put(g, ex - 1 + a, ey + b, a === 0 && b === 0 ? 'W' : 'K')
  }
  const ay = bottom - 2
  const arm = (side: number, kind: string) => {
    const x0 = side < 0 ? left - 1 : right + 1, x1 = x0 + side
    if (kind === 'down') { put(g, x0, ay, 'o'); put(g, x1, ay, 'o'); put(g, x1 + side, ay - 1, 'h') }
    if (kind === 'up') { put(g, x0, top + 1, 'o'); put(g, x1, top, 'o'); put(g, x1, top - 1, 'h'); put(g, x1 + side, top - 1, 'h') }
    if (kind === 'fwd') { put(g, x0, ay, 'o'); put(g, x1, ay - 1, 'o'); put(g, x1 + side, ay - 2, 'h') }
    if (kind === 'back') { put(g, x0, ay, 'o'); put(g, x1, ay + 1, 'o'); put(g, x1 + side, ay + 1, 'h') }
  }
  const A = typeof arms === 'string' ? [arms, arms] as const : arms
  arm(-1, A[0]); arm(1, A[1])
  // four legs; on a walking step two lift and swing the way he faces
  ;[left + 2, left + 5, right - 5, right - 2].forEach((lx, i) => {
    const lifted = step >= 0 && step % 2 === 0 && i % 2 === (step / 2) % 2
    const len = lifted ? 1 : legLen
    for (let k = 1; k <= len; k++) put(g, lx + (lifted ? face : 0), bottom + k, 's')
  })
  return { top, left, right, bottom, mid }
}

function shadow(g: Grid, cx: number, lift: number) {
  const half = Math.max(2, 7 - Math.round(lift))
  for (let x = cx - half; x <= cx + half; x++) put(g, x, GROUND + 1, 'g')
}

// Particles are pure functions of t so every frame can be sampled.
const rand = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x) }
const dust = (g: Grid, cx: number, age: number) => {
  if (age < 0 || age > 500) return
  const k = age / 500
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) put(g, cx + s * (5 + i + k * 4), GROUND - i - k * 2, 'd')
}
const DONE_PERIOD = 1000
const confetti = (g: Grid, cx: number, t: number) => {
  for (let i = 0; i < 14; i++) {
    const p = (t / DONE_PERIOD + rand(i)) % 1
    put(g, cx - 11 + rand(i + 9) * 22 + Math.sin((t / DONE_PERIOD) * 2 * Math.PI + i) * 1.5, p * GROUND, String(1 + (i % 5)))
  }
}
const zzz = (g: Grid, x: number, y: number, t: number) => {
  for (let i = 0; i < 3; i++) {
    const p = (t / 2200 + i / 3) % 1
    const zx = x + p * 6 + Math.sin(p * 6), zy = y - p * 7
    const ch = p < 0.6 ? 'z' : 'Z'
    put(g, zx, zy, ch); put(g, zx + 1, zy, ch); put(g, zx, zy + 1, ch)
  }
}
const sparkle = (g: Grid, x: number, y: number, t: number) => {
  const on = Math.floor(t / 400) % 2
  for (const [dx, dy] of on ? [[0, 0], [-6, 2], [5, 3]] : [[-3, -1], [4, 0], [1, 3]]) put(g, x + dx!, y + dy!, '*')
}
const bang = (g: Grid, x: number, y: number, t: number) => {
  const pop = t % 1200 < 150 ? -1 : 0
  for (const yy of [0, 1, 2]) put(g, x, y + yy + pop, '!')
  put(g, x, y + 4 + pop, '!')
}

type Drawn = { b: Body; dx?: number }
type Draw = (g: Grid, t: number) => Drawn
const alt = (t: number, every: number) => Math.floor(t / every) % 2 === 1
const WALK_SPAN = 24, WALK_SPEED = 0.007

const POSES: Record<Exclude<Pose, 'fail'>, { period: number; sample: number; draw: Draw }> = {
  idle: {
    period: 7200, sample: 40,
    draw(g, t) {
      const breath = alt(t, 1100)
      const blink = t % 3700 < 160
      const look = [0, 0, -1, -1, 0, 1, 1, 0][Math.floor(t / 900) % 8]!
      shadow(g, CX, 0)
      return { b: body(g, { eyes: blink ? 'blink' : 'open', look, arms: breath ? 'down' : 'back' }) }
    },
  },
  walk: {
    period: 2 * WALK_SPAN / WALK_SPEED, sample: 140,
    draw(g, t) {
      const d = (t * WALK_SPEED) % (WALK_SPAN * 2)
      const face = d < WALK_SPAN ? 1 : -1
      const travel = d < WALK_SPAN ? d : WALK_SPAN * 2 - d
      const step = Math.floor(t / 140) % 4
      shadow(g, CX, 0)
      return { b: body(g, { step, face, look: face, arms: step < 2 ? ['fwd', 'back'] : ['back', 'fwd'] }), dx: Math.round(travel - WALK_SPAN / 2) }
    },
  },
  hop: {
    period: 1600, sample: 80,
    draw(g, t) {
      const p = t % 1600
      let lift = 0, sq = 0, arms = 'down'
      if (p < 160) sq = 1
      else if (p < 760) { const k = (p - 160) / 600; lift = 6 * Math.sin(Math.PI * k); sq = k < 0.5 ? -1 : 0; arms = 'up' }
      else if (p < 900) sq = 1
      shadow(g, CX, lift)
      const b = body(g, { lift, sq, arms, eyes: 'happy' })
      dust(g, CX, p - 760)
      if (p > 300 && p < 1300) sparkle(g, CX, b.top - 1, t)
      return { b }
    },
  },
  alert: {
    period: 1200, sample: 80,
    draw(g, t) {
      const p = t % 1200
      const lift = p < 300 ? 3 * Math.sin(Math.PI * p / 300) : 0
      const shake = p > 300 && p < 600 ? (Math.floor(p / 80) % 2 ? 1 : -1) : 0
      shadow(g, CX, lift)
      const b = body(g, { cx: CX + shake, lift, eyes: 'wide', arms: alt(t, 300) ? ['up', 'down'] : ['down', 'up'] })
      bang(g, b.right + 4, b.top - 1, t)
      return { b }
    },
  },
  done: {
    period: DONE_PERIOD, sample: 100,
    draw(g, t) {
      const p = t % DONE_PERIOD, lift = 2 * Math.abs(Math.sin(Math.PI * p / 500))
      shadow(g, CX, lift); confetti(g, CX, t)
      return { b: body(g, { cx: CX + (alt(t, 500) ? 1 : -1), lift, eyes: 'happy', arms: alt(t, 250) ? ['up', 'down'] : ['down', 'up'] }) }
    },
  },
  sleep: {
    period: 2200, sample: 100,
    draw(g, t) {
      shadow(g, CX, 0)
      const b = body(g, { sq: 1, eyes: 'shut', arms: 'back' })
      zzz(g, b.right + 1, b.top, t)
      return { b }
    },
  },
}

function build({ period, sample, draw }: (typeof POSES)[keyof typeof POSES]) {
  const frames: (PetFrame & { ms: number })[] = []
  for (let t = 0; t < period; t += sample) {
    const g = newGrid()
    const { b, dx } = draw(g, t)
    const px = g.map(r => r.map(c => c ?? '.').join(''))
    const head: [number, number] = [b.mid, b.top]
    const prev = frames.at(-1)
    if (prev && prev.dx === dx && prev.head![0] === head[0] && prev.head![1] === head[1] && prev.px.every((r, i) => r === px[i])) prev.ms += sample
    else frames.push(dx === undefined ? { px, head, ms: sample } : { px, head, dx, ms: sample })
  }
  return { loop: true, frames }
}

export const CLAWD_SHEET: PetSheet = {
  w: SW,
  h: SH,
  palette: CLAWD_PAL,
  animations: Object.fromEntries((Object.keys(POSES) as (keyof typeof POSES)[]).map(k => [k, build(POSES[k])])),
}
const SHEETS: Record<PetId, PetSheet> = { clawd: CLAWD_SHEET, 'clawd-shiny': { ...CLAWD_SHEET, palette: shiny(CLAWD_SHEET.palette) } }

// Outfit grids are anchored at the head: [x, y] is the grid's top-left relative to head.
type Piece = { at: [number, number]; px: string[] }
const OUTFIT: Record<string, (now: number) => Piece[]> = {
  santa: () => [{ at: [-4, -2], px: ['..rrrrrrR', 'rrrrrrrr.', 'RRRRRRRR.'] }],
  party: () => [{ at: [-2, -4], px: ['..P..', '..p..', '.PPP.', 'ppppp'] }],
  nightcap: () => [{ at: [-5, -2], px: ['....nnnnnnnn..', 'nnnnnnnnnn..n.', '.............N'] }],
  pumpkin: () => [{ at: [8, 3], px: ['.UU.', 'uuuu', 'uuuu', 'uuuu'] }],
  sweat: now => {
    const p = (now % 900) / 900
    return [
      { at: [7, 1 + Math.floor(p * 4)], px: ['b'] },
      { at: [-7, 2 + Math.floor(((p + 0.5) % 1) * 4)], px: ['b'] },
    ]
  },
}

function frameFor(pet: PetId, pose: Pose, now: number) {
  const a = SHEETS[pet].animations
  const anim = a[pose] ?? (pose === 'fail' ? a.alert : undefined) ?? a.idle!
  return anim.frames[frameAt(anim, now)]!
}

export function petDx(pet: PetId, pose: Pose, now: number): number {
  return frameFor(pet, pose, now).dx ?? 0
}

// 'friday' is the band's sign, not drawn here.
export function petRows(pet: PetId, pose: Pose, now: number, overlays: readonly string[]): PetSpan[][] {
  const fr = frameFor(pet, pose, now)
  const rows = fr.px.map(r => r.split(''))
  if (fr.head) {
    for (const name of overlays) {
      for (const piece of OUTFIT[name]?.(now) ?? []) {
        piece.px.forEach((line, dy) => [...line].forEach((c, dx) => {
          const x = fr.head![0] + piece.at[0] + dx, y = fr.head![1] + piece.at[1] + dy
          if (c !== '.' && rows[y]?.[x] !== undefined) rows[y]![x] = c
        }))
      }
    }
  }
  return halfBlock(rows.map(r => r.join('')), SHEETS[pet].palette)
}
