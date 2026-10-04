import { test, expect } from 'claude-code/testing'
import { mix, gradient, wave } from '../hooks/color.ts'
import { SPINNERS, spinnerCells, cellsToSpans, type SpinnerId } from '../hooks/motion.ts'
import { cellWidth } from '../hooks/cells.ts'

const O = { color: '#38e8ff', bg: '#1a0b33', fg: '#f0e6ff' }
const ids = Object.keys(SPINNERS) as SpinnerId[]

test('mix blends #rrggbb and clamps t', async () => {
  expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  expect(mix('#102030', '#405060', 0)).toBe('#102030')
  expect(mix('#102030', '#405060', 2)).toBe('#405060')
})

test('gradient gives one span per code point and ends on both colors', async () => {
  const g = gradient('héllo', '#ff0000', '#0000ff')
  expect(g.map(s => s.text).join('')).toBe('héllo')
  expect(g[0]!.color).toBe('#ff0000')
  expect(g.at(-1)!.color).toBe('#0000ff')
  expect(gradient('x', '#ff0000', '#0000ff')[0]!.color).toBe('#ff0000')
})

test('wave moves with time', async () => {
  const at = (t: number) => wave('Thinking', '#000000', '#ffffff', t, 1).map(s => s.color).join()
  expect(at(0)).not.toBe(at(400))
})

test('the 0.2 library is exactly these six', async () => {
  expect(ids.sort()).toEqual(['clawd', 'comet', 'eyes', 'orb-states', 'shimmer', 'stock'])
})

test('every frame has its declared size and only width-1 BMP cells', async () => {
  for (const id of ids) for (const t of [0, 33, 517, 2999, 61_000]) {
    const rows = spinnerCells(id, t, O)
    expect(rows.length).toBe(SPINNERS[id].rows)
    for (const r of rows) {
      expect(r.length).toBe(SPINNERS[id].cols)
      for (const c of r) {
        const cp = c.ch.codePointAt(0)!
        expect([...c.ch].length).toBe(1)
        expect(cp >= 0x20 && cp <= 0xffff && cellWidth(cp) === 1).toBe(true)
        expect(c.fg).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  }
})

test('frames are deterministic and move over time', async () => {
  for (const id of ['comet', 'eyes', 'orb-states', 'clawd'] as const) {
    const at = (t: number) => JSON.stringify(spinnerCells(id, t, O))
    expect(at(1000)).toBe(at(1000))
    expect(new Set([0, 250, 1000, 3450].map(at)).size).toBeGreaterThan(1)
  }
})

test('orb states draw differently', async () => {
  const frames = (['think', 'search', 'work', 'run', 'agents'] as const).map(st => JSON.stringify(spinnerCells('orb-states', 1000, O, st)))
  expect(new Set(frames).size).toBe(5)
})

test('a frame uses few colors', async () => {
  for (const id of ids) expect(new Set(spinnerCells(id, 1234, O).flat().map(c => c.fg + (c.bg ?? ''))).size).toBeLessThanOrEqual(64)
})

test('clawd keeps his own color', async () => {
  expect(spinnerCells('clawd', 0, { ...O, color: '#00ff00' }).flat().every(c => c.fg === '#d77757')).toBe(true)
})

test('cellsToSpans merges runs of one color', async () => {
  const spans = cellsToSpans([[{ ch: 'a', fg: '#111111' }, { ch: 'b', fg: '#111111' }, { ch: 'c', fg: '#222222', bg: '#000000' }]])
  expect(spans[0]).toEqual([{ text: 'ab', color: '#111111' }, { text: 'c', color: '#222222', bg: '#000000' }])
})
