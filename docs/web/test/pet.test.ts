import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newPlayer } from '../app/landing/data.ts'
import { petTick } from '../app/landing/petTick.ts'

test('wander mode walks within bounds and never leaves [0, maxX]', () => {
  const p = newPlayer()
  let moved = false
  for (let t = 0; t < 60_000; t += 50) {
    petTick(p, { kind: 'wander' }, t, 40)
    assert.ok(p.x >= 0 && p.x <= 40)
    if (p.x > 0) moved = true
  }
  assert.ok(moved)
})

test('pose mode settles into the pose', () => {
  const p = newPlayer()
  for (let t = 0; t < 5_000; t += 50) petTick(p, { kind: 'pose', pose: 'working' }, t, 0)
  assert.equal(p.seg!.pose, 'working')
})
