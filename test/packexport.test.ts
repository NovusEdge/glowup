import { test, expect } from 'claude-code/testing'
import { packExport, packsJson } from '../hooks/packexport.ts'

test('exports the four built-in packs in preset order', async () => {
  expect(packExport().map(p => p.name)).toEqual(['classic', 'crt', 'cozy', 'arcade'])
})

test('arcade carries its resolved colors and spinner', async () => {
  const a = packExport().find(p => p.name === 'arcade')!
  expect([a.bg, a.border, a.borderColor, a.rows]).toEqual(['#1a0b33', 'bold', '#ff3ec8', 'cards'])
  expect(a.colors.accent).toBe('#ff3ec8')
  expect(a.gradient).toEqual(['#ff3ec8', '#38e8ff'])
  expect([a.spinner.id, a.spinner.color]).toEqual(['orb-states', '#38e8ff'])
  expect(a.spinner.frame.length).toBe(2)
})

test('classic falls back to the classic theme panel and stock spinner', async () => {
  const c = packExport().find(p => p.name === 'classic')!
  expect(c.bg).toBe(c.colors.panel)
  expect(c.gradient).toBe(null)
  expect(c.spinner.id).toBe('stock')
  expect(c.spinner.frame).toEqual([[{ ch: '✽', fg: c.spinner.color }]])
})

test('every color in the export is #rrggbb', async () => {
  const hex = /^#[0-9a-f]{6}$/i
  for (const p of packExport()) {
    for (const v of [p.bg, p.borderColor, p.spinner.color, ...Object.values(p.colors)]) expect(hex.test(v)).toBe(true)
  }
})

test('packsJson ends with one newline and round-trips', async () => {
  const s = packsJson()
  expect(s.endsWith('}\n]\n')).toBe(true)
  expect(JSON.parse(s)).toEqual(packExport())
})
