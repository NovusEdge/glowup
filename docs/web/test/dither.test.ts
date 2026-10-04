import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ditherColors } from '../app/landing/dither-colors.ts'
import { packLook } from '../app/landing/look.ts'

test('dither uses bg and two muted tones, never the raw accent', () => {
  const l = packLook('arcade')
  const [a, b, c] = ditherColors(l)
  assert.equal(a, l.bg)
  assert.notEqual(c, l.theme.colors.accent)
  assert.notEqual(b, l.bg)
})
