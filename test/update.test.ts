import { expect } from 'claude-code/testing'
import { test } from './kit.ts'
import { staleCopy, staleToast } from '../hooks/update.ts'

const CFG = '/home/u/.claude'
const at = (market: string, plugin: string, v: string) => `${CFG}/plugins/cache/${market}/${plugin}/${v}`
const file = (installPath: string, version: string, key = 'glowup@glowup') => ({ plugins: { [key]: [{ scope: 'user', installPath, version }] } })

test('an installed copy that is the recorded one is not stale', () => {
  expect(staleCopy(file(at('glowup', 'glowup', '0.4.0'), '0.4.0'), at('glowup', 'glowup', '0.4.0'), CFG)).toBeUndefined()
})

test('an installed copy whose folder differs from the recorded one is stale, and names the recorded version', () => {
  expect(staleCopy(file(at('glowup', 'glowup', '0.4.1'), '0.4.1'), at('glowup', 'glowup', '0.4.0'), CFG)).toBe('0.4.1')
})

test('a trailing slash does not make the same folder different', () => {
  expect(staleCopy(file(at('glowup', 'glowup', '0.4.0') + '/', '0.4.0'), at('glowup', 'glowup', '0.4.0'), CFG)).toBeUndefined()
})

test('a --plugin-dir copy is never stale', () => {
  expect(staleCopy(file(at('glowup', 'glowup', '0.4.1'), '0.4.1'), '/home/u/src/glowup', CFG)).toBeUndefined()
})

test('missing or malformed JSON gives nothing', () => {
  const root = at('glowup', 'glowup', '0.4.0')
  for (const j of [undefined, null, 'text', 3, [], {}, { plugins: 3 }, { plugins: { 'glowup@glowup': 'x' } }, { plugins: { 'glowup@glowup': [] } }, { plugins: { 'glowup@glowup': [{ version: '1' }] } }]) {
    expect(staleCopy(j, root, CFG)).toBeUndefined()
  }
})

test('no entry for this plugin gives nothing', () => {
  expect(staleCopy(file(at('other', 'other', '1.0.0'), '1.0.0', 'other@other'), at('glowup', 'glowup', '0.4.0'), CFG)).toBeUndefined()
})

test('the entry is matched by the marketplace and plugin in the root, not by glowup@glowup', () => {
  const j = { plugins: { ...file(at('glowup', 'glowup', '9.9.9'), '9.9.9').plugins, ...file(at('mine', 'glowup', '0.5.0'), '0.5.0', 'glowup@mine').plugins } }
  expect(staleCopy(j, at('mine', 'glowup', '0.4.0'), CFG)).toBe('0.5.0')
  expect(staleCopy(j, at('mine', 'glowup', '0.5.0'), CFG)).toBeUndefined()
})

test('a different marketplace name with no entry of its own gives nothing', () => {
  expect(staleCopy(file(at('glowup', 'glowup', '0.4.1'), '0.4.1'), at('mine', 'glowup', '0.4.0'), CFG)).toBeUndefined()
})

test('the toast names both versions and shows once per installed version', () => {
  const shown = new Set<string>()
  const root = at('glowup', 'glowup', '0.4.0')
  expect(staleToast(shown, file(at('glowup', 'glowup', '0.4.1'), '0.4.1'), root, CFG)).toBe('glowup 0.4.1 is installed, but this session runs 0.4.0. Run /reload-plugins to switch.')
  expect(staleToast(shown, file(at('glowup', 'glowup', '0.4.1'), '0.4.1'), root, CFG)).toBeUndefined()
  expect(staleToast(shown, file(at('glowup', 'glowup', '0.4.2'), '0.4.2'), root, CFG)).toContain('glowup 0.4.2 is installed')
  expect(staleToast(shown, file(root, '0.4.0'), root, CFG)).toBeUndefined()
})
