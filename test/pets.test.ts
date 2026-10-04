import { test, expect } from 'claude-code/testing'
import { petPose, halfBlock, frameAt, shiny, petPalette, composeFrame, validateSheet, animFor, newPlayer, stepPlayer, playerFrame, type PetSheet, CLAWD_SHEET, CLAWD_ROW, CLAWD_COLOR, SHINY_COLOR, PET_COLS, PET_ROWS, OUTFIT_PAD } from '../hooks/pets.ts'
import { cellWidth } from '../hooks/cells.ts'

const width = (s: string) => [...s].reduce((n, c) => n + cellWidth(c.codePointAt(0)!), 0)
const flat = (rows: { text: string }[][]) => rows.map(r => r.map(s => s.text).join(''))
const f = (c: string, exit?: boolean) => ({ px: [c], ms: 100, ...(exit ? { exit } : {}) })
const sheet = (): PetSheet => ({
  w: 1, h: 1, palette: {},
  animations: Object.fromEntries(['idle', 'walk', 'working', 'fail'].map(n => [n, { loop: true, frames: [f(n, true), f(n), f(n), f(n, true)] }])),
})
const draw =(pet: 'clawd' | 'clawd-shiny', pose: string, f: number, ov: string[] = []) =>
  halfBlock(composeFrame(CLAWD_SHEET, animFor(CLAWD_SHEET, pose).frames[f]!, ov, false), petPalette(CLAWD_SHEET, pet))

test('poses follow the table', async () => {
  const base = { working: false, needsYou: false }
  expect(petPose(base, 0)).toBe('idle')
  expect(petPose({ ...base, working: true }, 0)).toBe('walk')
  expect(petPose({ ...base, working: true, needsYou: true }, 0)).toBe('alert')
  const fail = { ...base, working: true, lastTest: { passed: false, at: 1000 } }
  expect(petPose(fail, 2000)).toBe('fail')
  expect(petPose(fail, 2600)).toBe('walk')
  expect(petPose({ ...fail, needsYou: true }, 2000)).toBe('alert')
  const pass = { ...base, working: true, lastTest: { passed: true, at: 1000 } }
  expect(petPose(pass, 2100)).toBe('hop')
  expect(petPose(pass, 2300)).toBe('walk')
  expect(petPose({ ...base, doneAt: 1000, doneOk: true }, 4900)).toBe('done')
  expect(petPose({ ...base, doneAt: 1000, doneOk: true }, 5100)).toBe('idle')
  expect(petPose({ ...base, doneAt: 1000, doneOk: false }, 1100)).toBe('idle')
})

test('done keeps dancing through its window, then returns to idle', async () => {
  const p = newPlayer(), seen = new Set<unknown>()
  stepPlayer(p, CLAWD_SHEET, 'idle', 0, 20)
  for (let t = 0; t <= 4000; t += 40) {
    stepPlayer(p, CLAWD_SHEET, 'done', t, 20)
    if (t >= 2500 && t <= 3500) seen.add(playerFrame(p, t))
  }
  expect(seen.size).toBeGreaterThan(1)
  for (let t = 4040; t <= 6000; t += 40) stepPlayer(p, CLAWD_SHEET, 'idle', t, 20)
  expect(p.seg!.pose).toBe('idle')
})

test('editing, shell commands and subagents type; everything else while working walks', async () => {
  const w = { working: true, needsYou: false }
  for (const kind of ['edit', 'shell', 'agent'] as const) expect(petPose({ ...w, kind }, 0)).toBe('working')
  for (const kind of ['read', 'search', 'plan', 'think'] as const) expect(petPose({ ...w, kind }, 0)).toBe('walk')
  expect(petPose({ ...w, kind: 'edit', lastTest: { passed: false, at: 0 } }, 100)).toBe('fail')
  expect(petPose({ ...w, kind: 'edit', lastTest: { passed: true, at: 0 } }, 100)).toBe('hop')
  expect(petPose({ working: false, needsYou: false, kind: 'edit' }, 0)).toBe('idle')
})

test('working and fail play their own animations and switch at exit frames', async () => {
  for (const pose of ['working', 'fail'] as const) expect(animFor(CLAWD_SHEET, pose)).toBe(CLAWD_SHEET.animations[pose])
  const sh = sheet(), p = newPlayer()
  stepPlayer(p, sh, 'walk', 0, 50)
  stepPlayer(p, sh, 'working', 150, 50)
  expect(p.seg!.pose).toBe('walk')
  stepPlayer(p, sh, 'working', 300, 50)
  expect(p.seg!.pose).toBe('working')
  stepPlayer(p, sh, 'fail', 305, 50)
  stepPlayer(p, sh, 'fail', 600, 50)
  expect(p.seg!.pose).toBe('fail')
})

test('a long idle falls asleep, work wakes him', async () => {
  const base = { working: false, needsYou: false, actAt: 1000 }
  expect(petPose(base, 1000 + 59_000)).toBe('idle')
  expect(petPose(base, 1000 + 60_000)).toBe('sleep')
  expect(petPose({ ...base, working: true }, 1000 + 20 * 60_000)).toBe('walk')
  expect(petPose({ ...base, needsYou: true }, 1000 + 20 * 60_000)).toBe('alert')
})

test('an unknown activity time never means asleep', async () => {
  const base = { working: false, needsYou: false }
  expect(petPose(base, 99 * 60_000)).toBe('idle')
  expect(petPose({ ...base, actAt: 0 }, 99 * 60_000)).toBe('idle')
})

test('a missing animation falls back: fail to alert, anything else to idle', async () => {
  const fr = (c: string) => ({ ms: 100, px: [c] })
  const sheet = { w: 1, h: 1, palette: {}, animations: { idle: { loop: true, frames: [fr('i')] }, alert: { loop: true, frames: [fr('a')] } } }
  expect(animFor(sheet, 'fail').frames[0]!.px).toEqual(['a'])
  expect(animFor(sheet, 'nope').frames[0]!.px).toEqual(['i'])
})

test('the shiny sheet is the sheet palette swapped to gold', async () => {
  const colors = new Set(draw('clawd-shiny', 'idle', 0).flat().flatMap(s => [s.color, s.bg]))
  expect(colors.has(CLAWD_SHEET.shiny!.L)).toBe(true)
})

test('the shipped sheet has no unknown palette keys and no ragged rows', async () => {
  validateSheet(CLAWD_SHEET)
})

test('a typo in a palette key throws instead of vanishing', async () => {
  const bad = { ...CLAWD_SHEET, animations: { idle: { loop: true, frames: [{ ms: 100, px: CLAWD_SHEET.animations.idle!.frames[0]!.px.map(r => r.replace('B', 'Q')) }] } } }
  expect(() => validateSheet(bad)).toThrow(/unknown palette key "Q"/)
  expect(() => validateSheet({ ...CLAWD_SHEET, outfits: { hat: { anchor: [0, 0], px: ['q'] } } })).toThrow(/outfit hat/)
})

test('halfBlock pairs pixel rows into half-block cells', async () => {
  const pal = { a: '#111111', b: '#222222' }
  expect(halfBlock(['a.ab', '.bab'], pal)[0]).toEqual([
    { text: '▀', color: '#111111' },
    { text: '▄', color: '#222222' },
    { text: '█', color: '#111111' },
    { text: '█', color: '#222222' },
  ])
  expect(halfBlock(['ab', 'ba'], pal)[0]).toEqual([
    { text: '▀', color: '#111111', bg: '#222222' },
    { text: '▀', color: '#222222', bg: '#111111' },
  ])
  expect(flat(halfBlock(['..', '..'], pal))).toEqual(['  '])
})

test('halfBlock merges runs and keeps blanks out of colored runs', async () => {
  const pal = { a: '#111111', b: '#222222' }
  const rows = halfBlock(['aa..aa', 'bb..bb'], pal)
  expect(flat(rows)).toEqual(['▀▀  ▀▀'])
  expect(rows[0]).toEqual([
    { text: '▀▀', color: '#111111', bg: '#222222' },
    { text: '  ', color: '#111111' },
    { text: '▀▀', color: '#111111', bg: '#222222' },
  ])
  expect(halfBlock(['a.', '..'], pal)[0]).toEqual([{ text: '▀ ', color: '#111111' }])
  expect(halfBlock(['.a', '.b'], pal)[0]![0]!.text).toBe(' ')
})

test('frameAt honors per-frame ms and loop', async () => {
  const f = (ms: number) => ({ px: [], ms })
  const loop = { loop: true, frames: [f(100), f(300), f(50)] }
  expect([0, 99, 100, 399, 400, 449, 450, 549, 550].map(t => frameAt(loop, t))).toEqual([0, 0, 1, 1, 2, 2, 0, 0, 1])
  const once = { loop: false, frames: [f(100), f(300)] }
  expect([0, 100, 399, 400, 99999].map(t => frameAt(once, t))).toEqual([0, 1, 1, 1, 1])
})

test('the sheet has every pose with enough frames', async () => {
  expect(CLAWD_SHEET.w).toBe(PET_COLS)
  expect(CLAWD_SHEET.h).toBe(PET_ROWS * 2)
  for (const pose of ['idle', 'walk', 'hop', 'alert', 'done', 'sleep', 'working', 'fail']) {
    const a = CLAWD_SHEET.animations[pose]!
    expect(a.loop).toBe(!['hop', 'fail'].includes(pose))
    expect(a.frames.length).toBeGreaterThanOrEqual(8)
    for (const fr of a.frames) {
      expect(fr.px).toHaveLength(CLAWD_SHEET.h)
      for (const r of fr.px) expect([...r]).toHaveLength(CLAWD_SHEET.w)
      expect(fr.ms).toBeGreaterThan(0)
    }
  }
  expect(CLAWD_SHEET.animations.walk!.frames.some(f => f.dx !== undefined && f.dx !== 0)).toBe(true)
  expect(CLAWD_SHEET.animations.idle!.frames.every(f => f.head !== undefined)).toBe(true)
})

test('every frame is PET_ROWS rows of exactly PET_COLS cells; outfits add the headroom', async () => {
  for (const pet of ['clawd', 'clawd-shiny'] as const)
    for (const [pose, a] of Object.entries(CLAWD_SHEET.animations)) a.frames.forEach((_, f) => {
      for (const ov of [[], ['friday']]) {
        const rows = flat(draw(pet, pose, f, ov))
        expect(rows).toHaveLength(PET_ROWS)
        for (const r of rows) expect(width(r)).toBe(PET_COLS)
      }
      for (const ov of [['santa'], ['nightcap', 'sweat'], ['pumpkin'], ['party']]) {
        const rows = flat(draw(pet, pose, f, ov))
        expect(rows).toHaveLength(PET_ROWS + OUTFIT_PAD / 2)
        for (const r of rows) expect(width(r)).toBe(PET_COLS)
      }
    })
})

test('movement frames last at least 80 ms and the body keeps the sheet colors', async () => {
  const clips = Object.entries(CLAWD_SHEET.transitions ?? {}).map(([n, c]) => [n, c.frames] as const)
  for (const [pose, frames] of [...Object.entries(CLAWD_SHEET.animations).map(([n, a]) => [n, a.frames] as const), ...clips]) {
    frames.forEach((fr, i) => {
      expect(fr.ms, `${pose}[${i}]`).toBeGreaterThanOrEqual(80)
      const keys = new Set(fr.px.join(''))
      for (const k of 'BD') expect(keys.has(k), `${pose}[${i}] has ${k}`).toBe(true)
    })
  }
})

test('exit frames and transition clips have the shape the Client reads', async () => {
  for (const [name, a] of Object.entries(CLAWD_SHEET.animations)) expect(a.frames.every(f => f.exit === undefined || f.exit === true), name).toBe(true)
  for (const [name, c] of Object.entries(CLAWD_SHEET.transitions ?? {})) {
    expect(typeof c.from, name).toBe('string')
    expect(typeof c.to, name).toBe('string')
    expect(c.frames.length, name).toBeGreaterThan(0)
  }
})

test('the one-row Clawd is five width-1 cells', async () => {
  expect([...CLAWD_ROW]).toHaveLength(5)
  expect(width(CLAWD_ROW)).toBe(5)
})

test('Clawd keeps his colors, shiny is gold', async () => {
  const colors = (pet: 'clawd' | 'clawd-shiny') => new Set(draw(pet, 'idle', 0).flat().flatMap(s => [s.color, s.bg].filter(Boolean)))
  expect(colors('clawd').has(CLAWD_COLOR)).toBe(true)
  expect(colors('clawd').has(SHINY_COLOR)).toBe(false)
  expect(colors('clawd-shiny').has(SHINY_COLOR)).toBe(true)
  expect(colors('clawd-shiny').has(CLAWD_COLOR)).toBe(false)
})

test('shiny swaps only the body colors, and only keys the palette has', async () => {
  const s = shiny(CLAWD_SHEET.palette)
  expect(s.B).toBe(SHINY_COLOR)
  expect(Object.keys(s).sort()).toEqual(Object.keys(CLAWD_SHEET.palette).sort())
})

test('outfits draw on the head and change the picture; unknown names change nothing', async () => {
  const base = (ov: string[]) => flat(draw('clawd', 'idle', 0, ov))
  for (const ov of ['santa', 'party', 'nightcap', 'pumpkin', 'sweat']) expect(base([ov]).join('\n')).not.toBe(base([]).join('\n'))
  expect(base(['friday'])).toEqual(base([]))
})

test('composeFrame mirrors every row', async () => {
  const sheet = { w: 3, h: 2, palette: { a: '#111111' }, animations: {} }
  expect(composeFrame(sheet, { px: ['a..', '.a.'] }, [], true)).toEqual(['..a', '.a.'])
})

test('a hand outfit sits at the frame hand, or four pixels under the head', async () => {
  const sheet = { w: 4, h: 4, palette: { a: '#111111', b: '#222222' }, outfits: { cup: { slot: 'hand' as const, anchor: [0, 0] as [number, number], px: ['b'] } }, animations: {} }
  const blank = ['....', '....', '....', '....', '....', '....']
  expect(composeFrame(sheet, { px: blank, head: [1, 0] }, ['cup'], false)[4 + OUTFIT_PAD]).toBe('.b..')
  expect(composeFrame(sheet, { px: blank, head: [1, 0], hand: [3, 1] }, ['cup'], false)[1 + OUTFIT_PAD]).toBe('...b')
})

test('walking carries horizontal travel in dx', async () => {
  expect(CLAWD_SHEET.animations.walk!.frames.every(f => (f.dx ?? 0) > 0)).toBe(true)
  const left = CLAWD_SHEET.animations['walk-left']
  if (left) expect(left.frames.every(f => (f.dx ?? 0) < 0)).toBe(true)
})
