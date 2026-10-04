import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cellOps } from '../app/landing/cells.ts'

const c = (ch: string, fg = '#fff', bg?: string) => ({ ch, fg, ...(bg ? { bg } : {}) })

test('braille becomes dots at the right sub-cell positions', () => {
  const { ops } = cellOps([[c(String.fromCharCode(0x2800 + 0x01 + 0x80))]], 10, 20)
  const dots = ops.filter(o => o.kind === 'dot')
  assert.equal(dots.length, 2)
  assert.deepEqual(dots.map(d => [d.x, d.y]), [[2.8, 2.5], [7.2, 17.5]])
})

test('block elements become exact quadrant rects', () => {
  const { ops } = cellOps([[c('▛')]], 10, 20)
  assert.deepEqual(ops.filter(o => o.kind === 'rect').map(o => [o.x, o.y, o.w, o.h]), [[0, 0, 5, 10], [5, 0, 5, 10], [0, 10, 5, 10]])
})

test('half block paints bg then top half', () => {
  const { ops } = cellOps([[c('▀', '#111', '#222')]], 10, 20)
  assert.deepEqual(ops.map(o => o.kind === 'rect' && [o.color, o.y, o.h]), [['#222', 0, 20], ['#111', 0, 10], ['#111', 0, 10]])
})

test('other glyphs are centered text; spaces draw nothing', () => {
  const { ops } = cellOps([[c('✻'), c(' ')]], 10, 20)
  assert.deepEqual(ops, [{ kind: 'text', x: 5, y: 10, ch: '✻', size: 14, color: '#fff' }])
})

test('minRows keeps the box height and centers fewer rows', () => {
  const r = cellOps([[c('·')]], 8, 17, 2)
  assert.equal(r.height, 34)
  assert.equal((r.ops[0] as any).y, 17)
})
