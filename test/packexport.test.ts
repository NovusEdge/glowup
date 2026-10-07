import { test, expect } from 'claude-code/testing'
import { PRESETS } from '../hooks/themes.ts'
import { SPINNER_IDS } from '../hooks/packs.ts'
import { CLAWD_SHEET, PET_ROWS } from '../hooks/pets.ts'
import { spinnerCells, type Cell } from '../hooks/motion.ts'
import { packExport, packsJson, exportAll, themeExport, spinnerExport, clawdExport } from '../hooks/packexport.ts'

test('exports the four built-in packs in preset order', async () => {
  expect(packExport().map(p => p.name)).toEqual(['classic', 'crt', 'cozy', 'arcade'])
})

test('arcade carries its resolved colors and spinner', async () => {
  const a = packExport().find(p => p.name === 'arcade')!
  expect([a.bg, a.border, a.borderColor, a.rows]).toEqual(['#1a0b33', 'bold', '#ff3ec8', 'cards'])
  expect(a.colors.accent).toBe('#ff3ec8')
  expect(a.gradient).toEqual(['#ff3ec8', '#38e8ff'])
  expect([a.spinner.id, a.spinner.color]).toEqual(['orb-states', '#38e8ff'])
})

test('classic falls back to the classic theme panel and stock spinner', async () => {
  const c = packExport().find(p => p.name === 'classic')!
  expect(c.bg).toBe(c.colors.panel)
  expect(c.gradient).toBe(null)
  expect(c.spinner.id).toBe('stock')
  expect(c.spinner.color).toBe(null)
})

test('every color in the export is #rrggbb', async () => {
  const hex = /^#[0-9a-f]{6}$/i
  for (const p of packExport()) {
    for (const v of [p.bg, p.borderColor, p.spinner.color ?? p.colors.accent, ...Object.values(p.colors)]) expect(hex.test(v)).toBe(true)
  }
  for (const t of themeExport()) for (const v of Object.values(t.colors)) expect(hex.test(v)).toBe(true)
})

test('packsJson ends with one newline and round-trips', async () => {
  const s = packsJson()
  expect(s.endsWith('}\n}\n')).toBe(true)
  expect(JSON.parse(s)).toEqual(exportAll())
})

test('every built-in theme is exported with its resolved colors', async () => {
  const themes = themeExport()
  expect(themes.map(t => t.name)).toEqual(Object.keys(PRESETS))
  expect(themes.find(t => t.name === 'dusk')!.colors.accent).toBe('#b69cff')
  expect(themes.find(t => t.name === 'glowup')!.word).toBe('Glowing')
})

test('every spinner is exported with frames in white on black', async () => {
  const sp = spinnerExport()
  expect(sp.map(s => s.id)).toEqual([...SPINNER_IDS])
  for (const s of sp) {
    expect(s.frames.length).toBeGreaterThan(0)
    for (const f of s.frames) expect(f.length).toBeGreaterThan(0)
  }
  expect(sp.filter(s => s.text).map(s => s.id)).toEqual(['eyes'])
  expect(sp.find(s => s.id === 'stock')!.frames.map(f => f[0]![0]!.ch).join('')).toBe('·✢✳✶✻✽')
  // Clawd's spinner keeps his own orange
  expect(sp.find(s => s.id === 'clawd')!.frames[0]![0]![0]!.fg).toBe('#d77757')
})

// The cycle the preview loops is the spinner's real period: moving a whole cycle on changes at
// most a few cells (rounding ms to an integer and float edges cost a cell or two). The scanline's
// background checker flips every 400 ms regardless, so only its sweep head is compared.
test('the looping spinners export one whole period, so the preview wraps without a jump', async () => {
  const mono = { color: '#ffffff', bg: '#000000', fg: '#ffffff' }
  const head = (f: Cell[][]) => f[0]!.findIndex(c => c.ch === '█')
  const diff = (a: Cell[][], b: Cell[][]) => a.flat().filter((c, i) => c.ch !== b.flat()[i]!.ch).length
  for (const s of spinnerExport().filter(s => ['scanline', 'ring', 'signal'].includes(s.id))) {
    const cycle = s.ms * s.frames.length
    const ts = Array.from({ length: 40 }, (_, i) => i * 97)
    const off = ts.map(t => s.id === 'scanline'
      ? Math.abs(head(spinnerCells('scanline', t, mono)) - head(spinnerCells('scanline', t + cycle, mono)))
      : diff(spinnerCells(s.id, t, mono), spinnerCells(s.id, t + cycle, mono)))
    expect([s.id, off.reduce((a, b) => a + b, 0) / ts.length < 1.5]).toEqual([s.id, true])
  }
})

test('Clawd is exported as his idle half-block rows in his own palette', async () => {
  const c = clawdExport()
  expect(c.cols).toBe(CLAWD_SHEET.w)
  expect(c.rows.length).toBe(PET_ROWS)
  const spans = c.rows.flat()
  expect(spans.every(s => /^#[0-9a-f]{6}$/i.test(s.color))).toBe(true)
  expect(spans.some(s => s.color === CLAWD_SHEET.palette.B)).toBe(true)
  for (const r of c.rows) expect(r.reduce((n, s) => n + [...s.text].length, 0)).toBe(CLAWD_SHEET.w)
})
