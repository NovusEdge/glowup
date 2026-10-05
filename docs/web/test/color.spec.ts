import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hexToHsv, hsvToHex } from '../app/studio/color.ts'

test('hex survives a round trip through hsv', () => {
  for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#7dc4e4', '#d77757', '#1f1f24']) {
    assert.equal(hsvToHex(hexToHsv(hex)), hex)
  }
})

test('primaries land on their hue', () => {
  assert.equal(hsvToHex({ h: 120, s: 1, v: 1 }), '#00ff00')
  assert.deepEqual(hexToHsv('#FF0000'), { h: 0, s: 1, v: 1 })
})

test('grey has no saturation', () => {
  assert.equal(hexToHsv('#808080').s, 0)
})

test('a hue just under 360 wraps back to red', () => {
  const hex = hsvToHex({ h: 359.9, s: 1, v: 1 })
  assert.equal(hex.slice(1, 3), 'ff')
  assert.ok(parseInt(hex.slice(5, 7), 16) <= 1)
})
