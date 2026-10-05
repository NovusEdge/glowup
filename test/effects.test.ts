import { test, expect } from 'claude-code/testing'
import { warpFrames, ditherMeters, turnDivider, WARP_FRAMES } from '../hooks/effects.ts'
import { validatePack, resolveLook } from '../hooks/packs.ts'
import { resolveTheme } from '../hooks/themes.ts'

const C = resolveTheme('classic', {}).theme.colors
const cells = (row: { text: string }[]) => row.reduce((n, s) => n + [...s.text].length, 0)

test('warp: a full loop of frames, each row exactly the asked width, all braille or blank', async () => {
  const { ms, frames } = warpFrames(58, 40, C, false)
  expect(frames.length).toBe(WARP_FRAMES)
  expect(ms).toBeGreaterThanOrEqual(40)
  for (const f of frames) {
    expect(f.length).toBe(40)
    for (const r of f) {
      expect(cells(r)).toBe(58)
      for (const s of r) expect(/^[⠀-⣿ ]+$/.test(s.text)).toBe(true)
    }
  }
})

test('warp: reduced motion is one frame, and the same input draws the same picture', async () => {
  expect(warpFrames(20, 6, C, true).frames.length).toBe(1)
  expect(JSON.stringify(warpFrames(20, 6, C, true))).toBe(JSON.stringify(warpFrames(20, 6, C, true)))
})

test('dither meters: one bar per window that fits the width and shows what is left', async () => {
  const rows = ditherMeters(50, [{ label: '5h', usedPercent: 14, reset: '↻3h0m' }, { label: 'wk', usedPercent: 26, reset: '↻Thu' }], 5, C)
  expect(rows.length).toBe(2)
  for (const r of rows) expect(cells(r)).toBe(50)
  const first = rows[0]!.map(s => s.text).join('')
  expect(first.startsWith('5h ')).toBe(true)
  expect(first).toContain(' 86%')
  expect(first).toContain('▓▒░')
  expect(first.endsWith('↻3h0m')).toBe(true)
  const ctx = ditherMeters(40, [], 30, C)
  expect(ctx.length).toBe(1)
  expect(ctx[0]!.map(s => s.text).join('')).toContain(' 70%')
})

test('turn divider: the number in accent between dithered ends, one fill cell', async () => {
  const d = turnDivider(3, C)
  expect(d.left.map(s => s.text).join('')).toBe('░▒▓━━ 03 ')
  expect(d.left[1]).toEqual({ text: '03', color: C.accent, bold: true })
  expect(d.fill.text).toBe('━')
  expect(d.right.map(s => s.text).join('')).toBe('▓▒░')
})

test('packs pick the effects: motion.field, colors.meters and colors.dividers, off by default', async () => {
  const file = { format: 1, name: 'fx', colors: { meters: 'dither', dividers: true }, motion: { field: 'warp' } }
  validatePack(file)
  const { look, errors } = resolveLook({ colors: 'fx', motion: 'fx' }, { fx: file }, {})
  expect(errors).toEqual([])
  expect([look.meters, look.dividers, look.motion.field]).toEqual(['dither', true, 'warp'])
  const base = resolveLook({ colors: 'classic', motion: 'classic' }, {}, {}).look
  expect([base.meters, base.dividers, base.motion.field]).toEqual(['default', false, 'none'])
})

test('a bad effect value is refused with the allowed values', async () => {
  const bad = (colors: object, motion: object = {}) => () => validatePack({ format: 1, name: 'x', colors, motion })
  expect(bad({ meters: 'bars' })).toThrow('colors.meters must be one of default, dither')
  expect(bad({ dividers: 'yes' })).toThrow('colors.dividers must be true or false')
  expect(bad({}, { field: 'plasma' })).toThrow('motion.field must be one of none, warp')
})
