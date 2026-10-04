import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PACK_NAMES, THEME_NAMES, packLook, lookVars, mixHex } from '../app/landing/look.ts'

test('every pack in packpresets resolves with its own bg', () => {
  assert.deepEqual(PACK_NAMES, ['classic', 'crt', 'cozy', 'arcade'])
  assert.equal(packLook('arcade').bg, '#1a0b33')
  assert.equal(packLook('crt').rows, 'retro')
})

test('a theme override replaces the whole palette, bg included (bg falls back to its panel)', () => {
  const l = packLook('cozy', 'dusk')
  assert.notEqual(l.bg, packLook('cozy').bg)
  assert.equal(l.bg, l.theme.colors.panel)
  assert.equal(l.theme.colors.accent, '#b69cff')
})

test('lookVars has every color key, bg and gradient fallbacks', () => {
  const v = lookVars(packLook('classic'))
  for (const k of ['--bg', '--accent', '--faint', '--addBg', '--g1', '--g2', '--bc', '--spinc']) assert.ok(v[k], k)
  assert.equal(v['--g1'], v['--accent'])
  assert.ok(THEME_NAMES.includes('high-contrast'))
})

test('mixHex blends channels', () => {
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080')
})
