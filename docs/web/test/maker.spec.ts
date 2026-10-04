import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makerResult, MAKER_START } from '../app/landing/maker.ts'

test('the starter file resolves over dusk', () => {
  const r = makerResult(MAKER_START)
  assert.equal(r.error, undefined)
  assert.equal(r.theme.colors.accent, '#ff8c42')
  assert.equal(r.theme.colors.dim, '#8a8cad')
  assert.deepEqual(r.theme.spinnerWords, ['Cooking'])
})

test('broken JSON reports a parse error', () => {
  assert.match(makerResult('{ "colors": ').error!, /./)
})

test('unknown extends reports the mod error text', () => {
  const r = makerResult('{ "extends": "nope" }')
  assert.match(r.error!, /theme "sunset"/)
})
