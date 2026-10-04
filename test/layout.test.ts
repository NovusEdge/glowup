import { test, expect } from 'claude-code/testing'
import { tierFor, fit, visibleLength, hearts, bar, ctxColor, toneColor } from '../hooks/layout.tsx'
import { resolveTheme } from '../hooks/themes.ts'

const T = resolveTheme('classic', {}).theme

test('tiers', async () => {
  expect(tierFor(200, true)).toBe('wide')
  expect(tierFor(200, false)).toBe('medium')
  expect(tierFor(80, false)).toBe('medium')
  expect(tierFor(79, false)).toBe('compact')
})

test('fit never exceeds the width', async () => {
  const segs = [{ text: 'abcdef', color: '#fff' }, { text: 'ghij', color: '#fff' }]
  for (const w of [1, 3, 6, 7, 10, 40]) expect(visibleLength(fit(segs, w))).toBeLessThanOrEqual(w)
  expect(fit(segs, 7).map(s => s.text).join('')).toBe('abcdef…')
})

test('hearts and bars', async () => {
  expect(hearts(0, T).map(s => s.text).join('')).toBe('♥♥♥♥♥')
  expect(hearts(52, T).map(s => s.text).join('')).toBe('♥♥♥♡♡')
  expect(hearts(100, T).map(s => s.text).join('')).toBe('♡♡♡♡♡')
  expect(bar(0.5, 10, '#fff', T).map(s => s.text).join('')).toBe('█████░░░░░')
  expect(ctxColor(59, T)).toBe(T.colors.read)
  expect(ctxColor(60, T)).toBe(T.colors.edit)
  expect(ctxColor(80, T)).toBe(T.colors.fail)
})

test('width is measured in terminal cells', async () => {
  expect(visibleLength([{ text: '日本語', color: '#fff' }])).toBe(6)
  expect(visibleLength([{ text: 'éa', color: '#fff' }])).toBe(2)
  const cjk = [{ text: '日本語日本語', color: '#fff' }]
  for (const w of [1, 2, 3, 4, 5, 6, 7, 8, 11, 12]) expect(visibleLength(fit(cjk, w))).toBeLessThanOrEqual(w)
  expect(fit(cjk, 6).map(s => s.text).join('')).toBe('日本…')
})

test('toneColor maps every tone to a theme color', async () => {
  const tones = ['text', 'read', 'edit', 'shell', 'agent', 'pass', 'fail', 'accent'] as const
  for (const k of tones) expect(toneColor(T, k)).toBe(T.colors[k])
})
