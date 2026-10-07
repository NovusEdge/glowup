import { expect } from 'claude-code/testing'
import { test } from './kit.ts'
import { allowed, newLines } from '../hooks/remote.ts'

test('the allowlist takes the TUI commands and refuses the rest', () => {
  for (const c of ['pack crt', 'spinner comet', 'spinner default', 'motion reduced', 'bubbles haiku', 'pet robot', 'color accent #112233', 'color reset accent', 'setup meter.warn 60', 'setup band combo,agents', 'statusline fields ctx cost']) expect(allowed(c)).toBe(true)
  for (const c of ['pack https://x.test/p.json', 'pack save mine', 'pet add /tmp/p.json', 'setup reset', 'statusline on', 'statusline restore', 'export konsole', 'import a.toml', 'config', 'theme aurora', 'color list', 'pack']) expect(allowed(c)).toBe(false)
})

test('newLines returns complete lines past the consumed count', () => {
  const text = '{"seq":1,"cmds":["pack crt"]}\n{"seq":2,"undo":true}\n'
  expect(newLines(text, 0)).toEqual({ lines: [{ seq: 1, cmds: ['pack crt'] }, { seq: 2, undo: true }], consumed: 2 })
  expect(newLines(text, 1)).toEqual({ lines: [{ seq: 2, undo: true }], consumed: 2 })
  expect(newLines(text, 2)).toEqual({ lines: [], consumed: 2 })
})

test('a last line without a newline waits', () => {
  expect(newLines('{"seq":1,"cmds":["pack crt"]}\n{"seq":2,"cm', 0)).toEqual({ lines: [{ seq: 1, cmds: ['pack crt'] }], consumed: 1 })
})

test('a line that does not parse is consumed as undefined', () => {
  expect(newLines('nope\n{"seq":"x"}\n{"seq":3,"cmds":[]}\n{"seq":4,"cmds":["pack crt"]}\n', 0))
    .toEqual({ lines: [undefined, undefined, undefined, { seq: 4, cmds: ['pack crt'] }], consumed: 4 })
})
