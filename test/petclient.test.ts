import { test, expect } from 'claude-code/testing'
import PetClient, { clock } from '../hooks/client/pet.tsx'
import { PET_ROWS, PET_COLS, CLAWD_ROW, CLAWD_SHEET, newPlayer, stepPlayer, playerFrame, mirrored, petPose, BUILTIN_SHEETS, CRITTER_ROW, mainColor, type PetSheet } from '../hooks/pets.ts'

function fakeSurface(columns = 0) {
  const timers: { ms: number; fn: () => void; cancelled: boolean }[] = []
  const calls = { setState: 0 }
  const s: any = {
    state: undefined, columns, elements: { Box: 'Box', Text: 'Text' },
    setState(v: unknown) { calls.setState++; s.state = typeof v === 'function' ? (v as (p: unknown) => unknown)(s.state) : v },
    every(ms: number, fn: () => void) { const t = { ms, fn, cancelled: false }; timers.push(t); return () => { t.cancelled = true } },
  }
  return { s, timers, calls }
}
const atTime = <T,>(t: number, run: () => T): T => {
  const real = clock.now
  clock.now = () => t
  try { return run() } finally { clock.now = real }
}
const base = { pet: 'clawd' as const, input: { working: true, needsYou: false }, overlays: [], reduced: false, compact: false, width: 46 }

test('one clock, started once; none under reduced motion', async () => {
  const a = fakeSurface()
  PetClient(base, a.s); PetClient(base, a.s); PetClient(base, a.s)
  expect(a.timers).toHaveLength(1)
  const b = fakeSurface()
  PetClient({ ...base, reduced: true }, b.s)
  expect(b.timers).toHaveLength(0)
  const c = fakeSurface()
  PetClient({ ...base, compact: true }, c.s)
  expect(c.timers).toHaveLength(0)
})

test('PET_ROWS rows wide strip; two more with an outfit; one row in the compact drawer', async () => {
  const { s } = fakeSurface()
  const tree = PetClient(base, s) as any
  expect(tree.children.filter((c: any) => c?.type === 'Box' || c?.type === 'Text')).toHaveLength(PET_ROWS)
  const hat = PetClient({ ...base, overlays: ['santa'] }, s) as any
  expect(hat.children.filter((c: any) => c?.type === 'Box' || c?.type === 'Text')).toHaveLength(PET_ROWS + 2)
  const c = fakeSurface()
  const small = JSON.stringify(PetClient({ ...base, compact: true }, c.s))
  expect(small).toContain(CLAWD_ROW)
})

test('a hop ends on its own: the pose comes from input and the clock, not a republish', async () => {
  const { s, timers } = fakeSurface()
  const props = { ...base, input: { working: true, needsYou: false, lastTest: { passed: true, at: 0 } } }
  PetClient(props, s)
  const at = (ms: number) => { s.setState(ms); return JSON.stringify(PetClient(props, s)) }
  const hopping = at(200)
  const later = at(5000)
  expect(later).not.toBe(hopping)
  expect(timers).toHaveLength(1)
})

const idle = { ...base, input: { working: false, needsYou: false } }

test('the tick redraws only when the picture changes', async () => {
  const { s, timers, calls } = fakeSurface()
  atTime(1_000_000, () => PetClient(idle, s))
  expect(calls.setState).toBe(1)
  const tick = timers[0]!.fn
  // idle frame 0 lasts 500 ms: ticks inside it draw nothing new
  for (const dt of [83, 166, 249, 332, 415]) atTime(1_000_000 + dt, tick)
  expect(calls.setState).toBe(1)
  atTime(1_000_000 + 510, tick)
  expect(calls.setState).toBe(2)
  atTime(1_000_000 + 520, tick)
  expect(calls.setState).toBe(2)
})

test('a tick under reduced motion or compact sets no state and cancels the timer', async () => {
  for (const patch of [{ reduced: true }, { compact: true }]) {
    const { s, timers, calls } = fakeSurface()
    atTime(1_000_000, () => PetClient(idle, s))
    PetClient({ ...idle, ...patch }, s)
    atTime(1_000_700, timers[0]!.fn)
    expect(calls.setState).toBe(1)
    expect(timers[0]!.cancelled).toBe(true)
    // back to normal: the clock starts again
    PetClient(idle, s)
    expect(timers).toHaveLength(2)
  }
})

test('the tick reads the latest props', async () => {
  const { s, timers, calls } = fakeSurface()
  atTime(1_000_000, () => PetClient(idle, s))
  PetClient({ ...idle, input: { working: true, needsYou: true } }, s)
  atTime(1_000_100, timers[0]!.fn)
  expect(calls.setState).toBe(2)
  expect(JSON.stringify(PetClient(idle, s))).toBeDefined()
})

test('surface.columns, when known, sets the room to walk in', async () => {
  const { s } = fakeSurface(30)
  const text = (n: any): string => (typeof n === 'string' ? n : (n?.children ?? []).map(text).join(''))
  for (let ms = 0; ms < 20000; ms += 700) {
    s.setState(ms)
    for (const row of (PetClient({ ...base, width: 46 }, s) as any).children) expect([...text(row)].length).toBeLessThanOrEqual(30)
  }
})

test('a pixel pair of two colors reaches backgroundColor', async () => {
  const { s } = fakeSurface()
  const walk = (n: any, out: any[] = []): any[] => { if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
  expect(walk(PetClient(idle, s)).some(n => typeof n.props?.backgroundColor === 'string')).toBe(true)
})

test('a row never passes the strip width, walking at the far edge', async () => {
  const { s } = fakeSurface()
  const text = (n: any): string => (typeof n === 'string' ? n : (n?.children ?? []).map(text).join(''))
  for (const width of [24, 30, 46]) for (const ms of [0, 5000, 20000, 60000]) {
    s.setState(ms)
    for (const row of (PetClient({ ...base, width }, s) as any).children) expect([...text(row)].length).toBeLessThanOrEqual(width)
  }
})

// A 2x2 sheet: frames are told apart by their pixel row.
const fr = (c: string, ms = 100, more: object = {}) => ({ px: [c.repeat(2), '..'], ms, ...more })
const sheet = (extra: Partial<PetSheet> = {}): PetSheet => ({
  w: 2, h: 2, palette: { i: '#111111', w: '#222222', a: '#333333', z: '#444444', s: '#555555' },
  animations: {
    idle: { loop: true, frames: [fr('i', 100, { exit: true }), fr('i'), fr('i'), fr('i', 100, { exit: true })] },
    walk: { loop: true, frames: [fr('w', 100, { exit: true, dx: 1 }), fr('w', 100, { dx: 1 }), fr('w', 100, { dx: 1 }), fr('w', 100, { dx: 1 })] },
    alert: { loop: true, frames: [fr('a'), fr('a')] },
    sleep: { loop: true, frames: [fr('z')] },
  },
  ...extra,
})
const px = (p: ReturnType<typeof newPlayer>, t: number) => playerFrame(p, t).px[0]![0]
const MAX = 100

test('a pose change mid-loop switches only at the exit frame', async () => {
  const sh = sheet(), p = newPlayer()
  stepPlayer(p, sh, 'idle', 0, MAX)
  stepPlayer(p, sh, 'walk', 150, MAX)
  expect(px(p, 150)).toBe('i')
  stepPlayer(p, sh, 'walk', 250, MAX)
  expect(px(p, 250)).toBe('i')
  stepPlayer(p, sh, 'walk', 300, MAX)
  expect(px(p, 300)).toBe('w')
  expect(p.seg!.start).toBe(300)
})

test('a late tick still starts the new animation at its exit frame, from frame 0', async () => {
  const sh = sheet(), p = newPlayer()
  stepPlayer(p, sh, 'idle', 0, MAX)
  stepPlayer(p, sh, 'walk', 150, MAX)
  stepPlayer(p, sh, 'walk', 380, MAX)
  expect(p.seg!.start).toBe(300)
  expect(p.seg!.pose).toBe('walk')
})

test('an animation with no exit frames is left at once', async () => {
  const sh = sheet(), p = newPlayer()
  stepPlayer(p, sh, 'sleep', 0, MAX)
  stepPlayer(p, sh, 'idle', 130, MAX)
  expect(p.seg!.pose).toBe('idle')
  expect(p.seg!.start).toBe(130)
})

test('the wait for an exit frame is capped at 300 ms', async () => {
  const sh = sheet({ animations: { ...sheet().animations, idle: { loop: true, frames: [fr('i', 1000, { exit: false }), fr('i', 1000, { exit: true })] } } })
  const p = newPlayer()
  stepPlayer(p, sh, 'idle', 0, MAX)
  stepPlayer(p, sh, 'walk', 100, MAX)
  stepPlayer(p, sh, 'walk', 399, MAX)
  expect(p.seg!.pose).toBe('idle')
  stepPlayer(p, sh, 'walk', 400, MAX)
  expect(p.seg!.pose).toBe('walk')
})

test('alert cuts in at once, through startle when the sheet has one', async () => {
  const p = newPlayer(), plain = sheet()
  stepPlayer(p, plain, 'idle', 0, MAX)
  stepPlayer(p, plain, 'alert', 150, MAX)
  expect(px(p, 150)).toBe('a')
  const withClip = sheet({ transitions: { startle: { from: '*', to: 'alert', frames: [fr('s'), fr('s')] } } }), q = newPlayer()
  stepPlayer(q, withClip, 'idle', 0, MAX)
  stepPlayer(q, withClip, 'alert', 150, MAX)
  expect(px(q, 150)).toBe('s')
  stepPlayer(q, withClip, 'alert', 400, MAX)
  expect(px(q, 400)).toBe('a')
  expect(q.seg!.start).toBe(350)
})

test('a clip plays between two animations, then the new one starts', async () => {
  const sh = sheet({ transitions: { stop: { from: 'walk', to: 'idle', frames: [fr('s'), fr('s')] } } }), p = newPlayer()
  stepPlayer(p, sh, 'walk', 0, MAX)
  stepPlayer(p, sh, 'idle', 400, MAX)
  expect(px(p, 400)).toBe('s')
  stepPlayer(p, sh, 'idle', 550, MAX)
  expect(px(p, 550)).toBe('s')
  stepPlayer(p, sh, 'idle', 600, MAX)
  expect(px(p, 600)).toBe('i')
  expect(p.seg!.start).toBe(600)
})

test('the most specific clip wins; a wildcard `from` matches any animation', async () => {
  const sh = sheet({ transitions: { any: { from: '*', to: 'sleep', frames: [fr('s')] }, soft: { from: 'idle', to: 'sleep', frames: [fr('s'), fr('s')] } } })
  const p = newPlayer()
  stepPlayer(p, sh, 'idle', 0, MAX)
  stepPlayer(p, sh, 'sleep', 0, MAX)
  expect(p.seg!.name).toBe('soft')
  const q = newPlayer()
  stepPlayer(q, sh, 'walk', 0, MAX)
  stepPlayer(q, sh, 'sleep', 0, MAX)
  expect(q.seg!.name).toBe('any')
})

test('walking x is kept across poses', async () => {
  const sh = sheet(), p = newPlayer()
  stepPlayer(p, sh, 'walk', 0, MAX)
  stepPlayer(p, sh, 'walk', 350, MAX)
  const x = p.x
  expect(x).toBe(4)
  stepPlayer(p, sh, 'idle', 400, MAX)
  stepPlayer(p, sh, 'idle', 900, MAX)
  expect(p.seg!.pose).toBe('idle')
  expect(p.x).toBe(x + 1)
  const held = p.x
  stepPlayer(p, sh, 'idle', 2000, MAX)
  expect(p.x).toBe(held)
  stepPlayer(p, sh, 'walk', 2100, MAX)
  stepPlayer(p, sh, 'walk', 2400, MAX)
  expect(p.x).toBeGreaterThan(held)
})

test('he turns around at the edge, mirrored unless the sheet draws the left walk', async () => {
  const sh = sheet(), p = newPlayer()
  stepPlayer(p, sh, 'walk', 0, 3)
  stepPlayer(p, sh, 'walk', 250, 3)
  expect(p.x).toBe(3)
  expect(p.dir).toBe(-1)
  expect(mirrored(p)).toBe(true)
  stepPlayer(p, sh, 'walk', 550, 3)
  expect(p.x).toBe(0)
  expect(p.dir).toBe(1)
  expect(mirrored(p)).toBe(false)

  const left = { ...sh.animations.walk!, frames: sh.animations.walk!.frames.map(f => ({ ...f, dx: -1, px: [f.px[0]!.replace(/w/g, 'l'), '..'] })) }
  const sl = sheet({ animations: { ...sh.animations, 'walk-left': left } }), q = newPlayer()
  stepPlayer(q, sl, 'walk', 0, 3)
  stepPlayer(q, sl, 'walk', 250, 3)
  expect(q.seg!.name).toBe('walk-left')
  expect(mirrored(q)).toBe(false)
  stepPlayer(q, sl, 'walk', 450, 3)
  expect(q.x).toBe(1)
})

test('leaving walk plays stop (or stop-left), then the lie-down entry; alert skips the exit clip', async () => {
  const clip = (from: string, to: string, c: string) => ({ from, to, frames: [fr(c)] })
  const sh = sheet({ transitions: { stop: clip('walk', 'idle', 's'), 'stop-left': clip('walk-left', 'idle', 'l'), 'lie-down': clip('*', 'sleep', 'd'), 'wake-up': clip('sleep', 'idle', 'u'), startle: clip('*', 'alert', 't') } })
  const p = newPlayer()
  stepPlayer(p, sh, 'walk', 0, MAX)
  stepPlayer(p, sh, 'sleep', 400, MAX)
  expect(px(p, 400)).toBe('s')
  stepPlayer(p, sh, 'sleep', 500, MAX)
  expect(px(p, 500)).toBe('d')
  stepPlayer(p, sh, 'sleep', 600, MAX)
  expect(px(p, 600)).toBe('z')
  // leaving sleep for alert cuts in through startle only
  stepPlayer(p, sh, 'alert', 650, MAX)
  expect(px(p, 650)).toBe('t')
  const q = newPlayer()
  stepPlayer(q, sh, 'sleep', 0, MAX)
  stepPlayer(q, sh, 'idle', 0, MAX)
  expect(px(q, 0)).toBe('u')
})

test('the last frame of a once-animation is an exit frame', async () => {
  const sh = sheet({ animations: { ...sheet().animations, hop: { loop: false, frames: [fr('h'), fr('h'), fr('h')] } } })
  const p = newPlayer()
  stepPlayer(p, sh, 'hop', 0, MAX)
  stepPlayer(p, sh, 'idle', 50, MAX)
  expect(p.seg!.pose).toBe('hop')
  stepPlayer(p, sh, 'idle', 299, MAX)
  expect(p.seg!.pose).toBe('hop')
  stepPlayer(p, sh, 'idle', 300, MAX)
  expect(p.seg!.pose).toBe('idle')
  expect(p.seg!.start).toBe(300)
})

// The real sheet, the real pose table, a tick far finer than 83 ms so no frame can hide between two draws.
function run(input: (t: number) => Parameters<typeof petPose>[0], from: number, to: number) {
  const p = newPlayer(), shown = new Set<object>(), poses = new Set<string>()
  for (let t = from; t <= to; t += 10) {
    const pose = petPose(input(t), t)
    stepPlayer(p, CLAWD_SHEET, pose, t, 22)
    shown.add(playerFrame(p, t))
    poses.add(pose)
  }
  return shown
}

test('the real sheet: a hop and a fail play every frame, whatever the pose table says meanwhile', async () => {
  const hop = run(t => ({ working: true, kind: 'read', needsYou: false, lastTest: t >= 1000 ? { passed: true, at: 1000 } : undefined }), 0, 6000)
  for (const f of CLAWD_SHEET.animations.hop!.frames) expect(hop.has(f)).toBe(true)
  const fail = run(t => ({ working: true, kind: 'edit', needsYou: false, lastTest: t >= 1000 ? { passed: false, at: 1000 } : undefined }), 0, 7000)
  for (const f of CLAWD_SHEET.animations.fail!.frames) expect(fail.has(f)).toBe(true)
})

test('walk to hop skips the stop clip; walk to idle plays it', async () => {
  const hop = run(t => ({ working: true, needsYou: false, lastTest: t >= 1000 ? { passed: true, at: 1000 } : undefined }), 0, 6000)
  for (const f of CLAWD_SHEET.transitions!.stop!.frames) expect(hop.has(f)).toBe(false)
  const idle = run(t => ({ working: t < 1000, needsYou: false }), 0, 3000)
  for (const f of CLAWD_SHEET.transitions!.stop!.frames) expect(idle.has(f) || CLAWD_SHEET.transitions!['stop-left']!.frames.some(g => idle.has(g))).toBe(true)
})

test('a pose change while clips are queued plans again from the new target', async () => {
  const sh = sheet({ transitions: { stop: { from: 'walk', to: 'idle', frames: [fr('s')] }, 'lie-down': { from: '*', to: 'sleep', frames: [fr('d')] } } }), p = newPlayer()
  stepPlayer(p, sh, 'walk', 0, MAX)
  stepPlayer(p, sh, 'sleep', 400, MAX)
  expect(px(p, 400)).toBe('s')
  stepPlayer(p, sh, 'walk', 450, MAX)
  stepPlayer(p, sh, 'walk', 500, MAX)
  expect(p.seg!.pose).toBe('walk')
  expect(p.seg!.clip).toBe(false)
})

test('with no room to walk he holds still', async () => {
  const sh = sheet(), p = newPlayer()
  stepPlayer(p, sh, 'walk', 0, 0)
  const dir = p.dir
  stepPlayer(p, sh, 'walk', 1000, 0)
  expect([p.x, p.dir]).toEqual([0, dir])
})

test('frame 0 of a walk counts on entry', async () => {
  const sh = sheet(), p = newPlayer()
  stepPlayer(p, sh, 'walk', 0, MAX)
  expect(p.x).toBe(1)
})

test('x never passes the width the pane gives', async () => {
  const sh = sheet(), p = newPlayer()
  for (let t = 0; t < 5000; t += 83) { stepPlayer(p, sh, 'walk', t, 6); expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(6) }
  stepPlayer(p, sh, 'walk', 5100, 2)
  expect(p.x).toBeLessThanOrEqual(2)
  expect(PET_COLS).toBe(24)
})

test('a sheet without transitions or exit flags switches directly', async () => {
  const bare = sheet({ animations: { idle: { loop: true, frames: [fr('i')] }, walk: { loop: true, frames: [fr('w', 100, { dx: 1 })] } } }), p = newPlayer()
  stepPlayer(p, bare, 'idle', 0, MAX)
  stepPlayer(p, bare, 'walk', 50, MAX)
  expect(px(p, 50)).toBe('w')
  stepPlayer(p, bare, 'alert', 60, MAX)
  expect(px(p, 60)).toBe('i')
})

test('the robot draws from its own sheet; the drawer shows the critter row in its main color', () => {
  const robot = JSON.stringify(PetClient({ ...base, pet: 'robot' }, fakeSurface().s))
  expect(robot).not.toBe(JSON.stringify(PetClient(base, fakeSurface().s)))
  const small = JSON.stringify(PetClient({ ...base, pet: 'robot', compact: true }, fakeSurface().s))
  expect(small).toContain(CRITTER_ROW)
  expect(small).toContain(mainColor(BUILTIN_SHEETS.robot!))
})

test('a pet draws as many rows as its sheet is tall', () => {
  const rows = (props: object) => (PetClient({ ...base, ...props }, fakeSurface().s) as any).children.length
  expect(rows({ pet: 'robot' })).toBe(8)
  const sheet: PetSheet = { w: 4, h: 4, palette: { A: '#abcdef' }, animations: { idle: { loop: true, frames: [{ ms: 400, px: ['AAAA', 'AAAA', 'AAAA', 'AAAA'] }] } } }
  expect(rows({ pet: 'mochi', sheet, input: { working: false, needsYou: false } })).toBe(2)
})

const rowText = (n: any): string => (typeof n === 'string' ? n : Array.isArray(n) ? n.map(rowText).join('') : n && typeof n === 'object' ? rowText(n.children) : '')

test('a pet wider than the strip stands still', () => {
  // 28 is between the old 24-column bound and the robot's 32, so only the sheet's own width keeps it at 0
  const { s, timers } = fakeSurface(28)
  const tree = PetClient({ ...base, pet: 'robot', width: 28 }, s) as any
  expect(tree.children).toHaveLength(8)
  for (const row of tree.children) for (const t of row.children) expect(t.props.wrap).toBe('truncate')
  const t0 = Date.now()
  for (let i = 1; i <= 40; i++) atTime(t0 + i * 500, () => timers[0]!.fn())
  expect(s.state.player.x).toBe(0)
})

test('a pet never walks past the strip: the robot stops at width minus its own 32', () => {
  const { s, timers } = fakeSurface(46)
  PetClient({ ...base, pet: 'robot', width: 46 }, s)
  const t0 = Date.now()
  let top = 0
  for (let i = 1; i <= 200; i++) { atTime(t0 + i * 83, () => timers[0]!.fn()); top = Math.max(top, s.state.player.x) }
  expect(top).toBeGreaterThan(0)
  expect(top).toBeLessThanOrEqual(46 - 32)
})

test('a pet wider than the strip is cut at its right edge, not squeezed', () => {
  const draw = (width: number) => atTime(1000, () => (PetClient({ ...base, pet: 'robot', width }, fakeSurface(width).s) as any).children.map(rowText) as string[])
  // 32 leaves the robot no room to walk, so both draws are the same frame at x = 0
  const full = draw(32), cut = draw(28)
  expect(cut).toHaveLength(8)
  cut.forEach((row, i) => {
    expect([...row].length).toBeLessThanOrEqual(28)
    expect(row).toBe([...full[i]!].slice(0, 28).join(''))
  })
})
