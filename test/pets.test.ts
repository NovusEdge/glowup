import { test, expect } from 'claude-code/testing'
import { FX, petPose, petRows, petDx, halfBlock, frameAt, shiny, CLAWD_SHEET, CLAWD_ROW, CLAWD_COLOR, SHINY_COLOR, PET_COLS, PET_ROWS } from '../hooks/pets.ts'
import { cellWidth } from '../hooks/cells.ts'

const width = (s: string) => [...s].reduce((n, c) => n + cellWidth(c.codePointAt(0)!), 0)
const flat = (rows: { text: string }[][]) => rows.map(r => r.map(s => s.text).join(''))

test('poses follow the table', async () => {
  const base = { working: false, needsYou: false }
  expect(petPose(base, 0)).toBe('idle')
  expect(petPose({ ...base, working: true }, 0)).toBe('walk')
  expect(petPose({ ...base, working: true, needsYou: true }, 0)).toBe('alert')
  const fail = { ...base, working: true, lastTest: { passed: false, at: 1000 } }
  expect(petPose(fail, 2000)).toBe('alert')
  expect(petPose(fail, 2600)).toBe('walk')
  const pass = { ...base, working: true, lastTest: { passed: true, at: 1000 } }
  expect(petPose(pass, 2100)).toBe('hop')
  expect(petPose(pass, 2300)).toBe('walk')
  expect(petPose({ ...base, doneAt: 1000, doneOk: true }, 2400)).toBe('done')
  expect(petPose({ ...base, doneAt: 1000, doneOk: false }, 1100)).toBe('idle')
})

test('a long idle falls asleep, work wakes him', async () => {
  const base = { working: false, needsYou: false, actAt: 1000 }
  expect(petPose(base, 1000 + 9 * 60_000)).toBe('idle')
  expect(petPose(base, 1000 + 10 * 60_000)).toBe('sleep')
  expect(petPose({ ...base, working: true }, 1000 + 20 * 60_000)).toBe('walk')
  expect(petPose({ ...base, needsYou: true }, 1000 + 20 * 60_000)).toBe('alert')
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
  for (const pose of ['idle', 'walk', 'hop', 'alert', 'done', 'sleep']) {
    const a = CLAWD_SHEET.animations[pose]!
    expect(a.loop).toBe(true)
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

test('every frame is PET_ROWS rows of exactly PET_COLS cells', async () => {
  for (const pet of ['clawd', 'clawd-shiny'] as const)
    for (const pose of ['idle', 'walk', 'hop', 'alert', 'done', 'sleep'] as const) for (const t of [0, 400, 450, 900, 1300, 5000])
      for (const ov of [[], ['santa'], ['nightcap', 'sweat'], ['pumpkin'], ['party'], ['friday']]) {
        const rows = flat(petRows(pet, pose, t, ov))
        expect(rows).toHaveLength(PET_ROWS)
        for (const r of rows) expect(width(r)).toBe(PET_COLS)
      }
})

test('no frame recolors the whole sprite', async () => {
  // Movement frames may be 30-150 ms; the palette is the sheet's and never swaps mid-animation.
  for (const [pose, a] of Object.entries(CLAWD_SHEET.animations)) {
    a.frames.forEach((fr, i) => {
      expect(fr.ms, `${pose}[${i}]`).toBeGreaterThanOrEqual(30)
      const keys = new Set(fr.px.join(''))
      // the body always uses the sheet's own colors, so only movement changes between frames
      for (const k of 'ohs') expect(keys.has(k), `${pose}[${i}] has ${k}`).toBe(true)
      for (const k of keys) expect(k === '.' || k in CLAWD_SHEET.palette || k in FX, `${pose}[${i}] key ${k}`).toBe(true)
    })
  }
})

test('the one-row Clawd is five width-1 cells', async () => {
  expect([...CLAWD_ROW]).toHaveLength(5)
  expect(width(CLAWD_ROW)).toBe(5)
})

test('Clawd keeps his colors, shiny is gold, alert adds a !', async () => {
  const colors = (pet: 'clawd' | 'clawd-shiny') => new Set(petRows(pet, 'idle', 0, []).flat().flatMap(s => [s.color, s.bg].filter(Boolean)))
  expect(colors('clawd').has(CLAWD_COLOR)).toBe(true)
  expect(colors('clawd').has(SHINY_COLOR)).toBe(false)
  expect(colors('clawd-shiny').has(SHINY_COLOR)).toBe(true)
  expect(colors('clawd-shiny').has(CLAWD_COLOR)).toBe(false)
  const bang = (pose: 'idle' | 'alert') => petRows('clawd', pose, 0, []).flat().some(s => s.color === '#ff6b80' || s.bg === '#ff6b80')
  expect(bang('alert')).toBe(true)
  expect(bang('idle')).toBe(false)
})

test('shiny swaps only the body colors', async () => {
  const s = shiny(CLAWD_SHEET.palette)
  expect(s.o).toBe(SHINY_COLOR)
  expect(Object.keys(s).sort()).toEqual(Object.keys(CLAWD_SHEET.palette).sort())
})

test('outfits draw on top of the head and change the picture', async () => {
  for (const ov of ['santa', 'party', 'nightcap', 'pumpkin', 'sweat'])
    expect(flat(petRows('clawd', 'idle', 0, [ov]))).not.toEqual(flat(petRows('clawd', 'idle', 0, [])))
  expect(flat(petRows('clawd', 'idle', 0, ['friday']))).toEqual(flat(petRows('clawd', 'idle', 0, [])))
})

test('walking carries horizontal travel in dx', async () => {
  const xs = new Set<number>()
  for (let t = 0; t < 7000; t += 100) xs.add(petDx('clawd', 'walk', t))
  expect(Math.min(...xs)).toBeLessThan(0)
  expect(Math.max(...xs)).toBeGreaterThan(0)
  expect(petDx('clawd', 'idle', 0)).toBe(0)
})
