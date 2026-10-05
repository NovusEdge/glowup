import { test, expect } from 'claude-code/testing'
import { resolveLook, validatePack, exportMix, stockMotion, SPINNER_IDS, type Mix } from '../hooks/packs.ts'
import { PACKS } from '../hooks/packpresets.ts'
import { resolveTheme } from '../hooks/themes.ts'

const pack = (name: string): Mix => ({ colors: name, motion: name })
const look = (m: Mix, user: Record<string, unknown> = {}) => resolveLook(m, user, {})

test('built-in packs resolve cleanly', async () => {
  for (const n of ['classic', 'crt', 'cozy', 'arcade']) expect(look(pack(n)).errors).toEqual([])
  expect(Object.keys(PACKS).sort()).toEqual(['arcade', 'classic', 'cozy', 'crt'])
})

test('classic is the 0.1 look', async () => {
  const l = look(pack('classic')).look
  expect(l.theme).toEqual(resolveTheme('classic', {}).theme)
  expect([l.rows, l.border, l.motion.spinner, l.extras.hp, l.extras.combo]).toEqual(['classic', 'round', 'stock', false, false])
})

test('arcade carries the mockup values', async () => {
  const l = look(pack('arcade')).look
  expect(l.theme.colors.accent).toBe('#ff3ec8')
  expect(l.theme.name).toBe('classic')
  expect([l.rows, l.border, l.bg, l.borderColor]).toEqual(['cards', 'bold', '#1a0b33', '#ff3ec8'])
  expect(l.gradient).toEqual(['#ff3ec8', '#38e8ff'])
  expect(l.extras).toEqual({ hp: true, combo: true })
  expect(l.rowFlags).toEqual({ labels: false, markers: true, xp: true })
  expect(l.motion).toEqual({ spinner: 'orb-states', shimmer: 2, color: '#38e8ff', field: 'none' })
})

test('layers mix: crt colors with arcade motion', async () => {
  const l = look({ colors: 'crt', motion: 'arcade' }).look
  expect([l.colorsFrom, l.motionFrom, l.rows, l.motion.spinner]).toEqual(['crt', 'arcade', 'retro', 'orb-states'])
})

test('mix.theme replaces the palette and keeps rows and border', async () => {
  const l = look({ ...pack('arcade'), theme: 'dusk' }).look
  const dusk = resolveTheme('dusk', {}).theme
  expect(l.theme.colors).toEqual(dusk.colors)
  expect([l.rows, l.border, l.bg, l.borderColor]).toEqual(['cards', 'bold', dusk.colors.panel, dusk.colors.faint])
  expect(l.gradient).toEqual([dusk.colors.accent, dusk.colors.read])
})

test('mix.spinner overrides the motion layer; an unknown id falls back to stock with a reason', async () => {
  expect(look({ ...pack('crt'), spinner: 'eyes' }).look.motion.spinner).toBe('eyes')
  const r = look({ ...pack('crt'), spinner: 'orb' })
  expect(r.look.motion.spinner).toBe('stock')
  expect(r.errors.join()).toContain('"orb"')
})

test('extends and layer references', async () => {
  const user = { mine: { format: 1, name: 'mine', extends: 'cozy', colors: { rows: 'retro' }, motion: 'crt' } }
  const l = look(pack('mine'), user).look
  expect([l.rows, l.gradient?.[0], l.motion.spinner]).toEqual(['retro', '#f4a6b8', 'comet'])
})

test('row flags default to labels on, and a user pack can set them over an extends chain', async () => {
  expect(look(pack('classic')).look.rowFlags).toEqual({ labels: true, markers: false, xp: false })
  const user = { mine: { format: 1, name: 'mine', extends: 'arcade', colors: { rowFlags: { markers: false } } } }
  expect(look(pack('mine'), user).look.rowFlags).toEqual({ labels: false, markers: false, xp: true })
})

test('mix.overrides sit on top of the pack, a theme override, and the classic fallback', async () => {
  const overrides = { accent: '#010203', panel: '#040506' }
  const a = look({ ...pack('cozy'), overrides }).look
  expect([a.theme.colors.accent, a.theme.colors.text, a.motion.color]).toEqual(['#010203', '#f5e6d3', '#ffd9a0'])
  const t = look({ ...pack('classic'), theme: 'dusk', overrides }).look
  expect([t.theme.colors.accent, t.bg, t.theme.colors.read]).toEqual(['#010203', '#040506', resolveTheme('dusk', {}).theme.colors.read])
  const fallback = look({ ...pack('ghost'), overrides }).look
  expect(fallback.theme.colors.accent).toBe('#010203')
  expect(look({ ...pack('cozy'), overrides: { accent: 'nope', bogus: '#ffffff' } as never }).look.theme.colors.accent).toBe('#f4a6b8')
})

test('a bad layer falls back alone, with its reason', async () => {
  const user = { half: { format: 1, name: 'half', colors: { rows: 'fancy' }, motion: { spinner: 'comet' } } }
  const r = look(pack('half'), user)
  expect([r.look.rows, r.look.colorsFrom, r.look.motion.spinner]).toEqual(['classic', 'classic', 'comet'])
  expect(r.errors[0]).toContain('rows')
})

test('unknown pack falls back to classic', async () => {
  expect(look(pack('ghost')).errors.join()).toContain('no pack named "ghost"')
})

test('cycles and chains deeper than 8 are refused', async () => {
  const loop = { a: { format: 1, name: 'a', extends: 'b' }, b: { format: 1, name: 'b', motion: 'a' } }
  expect(look(pack('a'), loop).errors.join()).toContain('loops')
  const deep: Record<string, unknown> = {}
  for (let i = 0; i < 9; i++) deep['p' + i] = { format: 1, name: 'p' + i, extends: i < 8 ? 'p' + (i + 1) : 'classic' }
  expect(look(pack('p0'), deep).errors.join()).toContain('deeper than 8')
  // seven user packs plus classic is eight levels: allowed
  delete deep.p8; delete deep.p7; (deep.p6 as { extends: string }).extends = 'classic'
  expect(look(pack('p0'), deep).errors).toEqual([])
})

test('validation refuses bad values', async () => {
  const bad: [unknown, string][] = [
    [{ format: 1, name: 'x', colors: { palette: { accent: 'red' } } }, '#rrggbb'],
    [{ format: 1, name: 'x', colors: { palette: { glow: '#ffffff' } } }, 'unknown color'],
    [{ format: 1, name: 'x', colors: { border: 'dotted' } }, 'border'],
    [{ format: 1, name: 'x', colors: { gradient: ['#ffffff'] } }, 'gradient'],
    [{ format: 1, name: 'x', colors: { extras: { hp: 'yes' } } }, 'extras'],
    [{ format: 1, name: 'x', colors: { rowFlags: { labels: 'no' } } }, 'rowFlags'],
    [{ format: 1, name: 'x', colors: { rowFlags: { sparkle: true } } }, 'rowFlags'],
    [{ format: 1, name: 'x', motion: { spinner: 'Disco Ball' } }, 'spinner'],
    [{ format: 1, name: 'x', motion: { shimmer: 3 } }, 'shimmer'],
    [{ format: 1, name: 'x', wobble: true }, 'unknown key'],
    [{ name: 'x' }, '"format"'],
    [{ format: 2, name: 'x' }, 'newer glowup'],
    ['x', 'JSON object'],
  ]
  for (const [file, msg] of bad) expect(() => validatePack(file)).toThrow(msg)
})

test('sound and voice are reserved and ignored', async () => {
  expect(() => validatePack({ format: 1, name: 'x', sound: { anything: 1 }, voice: 'later' })).not.toThrow()
})

test('fuzz: unsafe characters in any shown string are refused', async () => {
  const nasty = ['\u001b[2J', '\u0007', '​', '‮', '⁦', '﻿', '\u0085']
  for (const c of nasty) {
    expect(() => validatePack({ format: 1, name: 'x', description: `a${c}b` })).toThrow('description')
    expect(() => validatePack({ format: 1, name: 'x', extends: `a${c}b` })).toThrow()
    expect(look(pack(`a${c}b`)).errors.join()).not.toContain(c)
  }
})

test('exportMix is self-contained and resolves to the same look', async () => {
  const l = look({ colors: 'crt', motion: 'cozy' }).look
  const file = exportMix(l, 'mine')
  expect(file.format).toBe(1)
  expect(typeof file.colors).toBe('object')
  const again = look(pack('mine'), { mine: JSON.parse(JSON.stringify(file)) })
  expect(again.errors).toEqual([])
  const strip = ({ colorsFrom, motionFrom, ...rest }: typeof l) => rest
  expect(strip(again.look)).toEqual(strip(l))
})

test('built-in packs win over a stray user file of the same name', async () => {
  const r = look(pack('crt'), { classic: '{' })
  expect(r.errors).toEqual([])
  expect(r.look).toEqual(look(pack('crt')).look)
})

test('exportMix description is built from shown names and fits 80 characters', async () => {
  const l = look(pack('crt')).look
  const long = { ...l, colorsFrom: 'a'.repeat(40), motionFrom: 'b'.repeat(40) }
  const file = exportMix(long, 'mine')
  expect(file.description!.length).toBeLessThanOrEqual(80)
  expect(() => validatePack(file)).not.toThrow()
  const evil = exportMix({ ...l, colorsFrom: 'a\u001b[2Jb' }, 'mine')
  expect(evil.description).not.toContain('\u001b')
})

test('stockMotion freezes motion', async () => {
  expect(stockMotion(look(pack('arcade')).look).motion).toEqual({ spinner: 'stock', shimmer: 0, color: '#38e8ff', field: 'none' })
  expect(SPINNER_IDS).toHaveLength(6)
})
