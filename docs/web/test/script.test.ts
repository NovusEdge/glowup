import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SCRIPT, LOOP_MS, initialState, finalState, stateAt, runScript } from '../app/landing/script.ts'

test('steps are in time order and the loop ends after the last', () => {
  for (let i = 1; i < SCRIPT.length; i++) assert.ok(SCRIPT[i]!.at >= SCRIPT[i - 1]!.at)
  assert.ok(LOOP_MS > SCRIPT.at(-1)!.at)
})

test('final frame is the done state with the passing result', () => {
  const f = finalState()
  assert.equal(f.status.tone, 'done')
  assert.ok(f.rows.some(r => r.t === 'result' && r.tone === 'ok'))
  assert.ok(f.rows.some(r => r.t === 'result' && r.tone === 'bad'))
  assert.deepEqual(f.files.map(x => x.name), ['src/auth.ts', 'src/routes.ts', 'test/auth.test.ts'])
})

test('Clawd fails on the red test, then goes back to working on the fix', () => {
  const pose = (ms: number) => { const p = stateAt(ms).pet; return p.kind === 'pose' ? p.pose : p.kind }
  const failAt = SCRIPT.find(st => { const p = st.apply(initialState()).pet; return p.kind === 'pose' && p.pose === 'fail' })!.at
  assert.equal(pose(failAt), 'fail')
  assert.equal(pose(failAt + 1900), 'working')
})

test('stateAt is periodic', () => {
  assert.deepEqual(stateAt(1234), stateAt(1234 + LOOP_MS))
  assert.deepEqual(stateAt(0), initialState())
})

test('runScript stop() clears every pending timer', () => {
  const pending = new Set<number>(); let id = 0, t = 0
  const clock = {
    now: () => t,
    setTimeout: ((fn: () => void, ms: number) => { const k = ++id; pending.add(k); return k as any }) as any,
    clearTimeout: ((k: number) => { pending.delete(k) }) as any,
  }
  const r = runScript(() => {}, clock)
  assert.ok(pending.size > 0)
  r.stop()
  assert.equal(pending.size, 0)
})

test('one runner emits states in order and never twice for the same step', () => {
  const seen: number[] = []; let t = 0; const q: Array<[number, () => void]> = []
  const clock = { now: () => t, setTimeout: ((fn: () => void, ms: number) => { q.push([t + ms, fn]); return q.length as any }) as any, clearTimeout: (() => {}) as any }
  runScript(s => seen.push(s.rows.length), clock)
  for (let i = 0; i < 200 && q.length; i++) { q.sort((a, b) => a[0] - b[0]); const [at, fn] = q.shift()!; t = at; fn() }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i]! >= seen[i - 1]! || seen[i] === 0)
})
