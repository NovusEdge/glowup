import { test, expect } from 'claude-code/testing'
import { fill, pickLine, bubbleFor, CLAWD_SAY } from '../hooks/bubbles.ts'

test('fill replaces placeholders, strips unsafe characters and caps at 40', async () => {
  expect(fill('{n}/{n} green', { n: 12 })).toBe('12/12 green')
  expect(fill('editing {file}', {})).toBe('editing …')
  expect(fill('a\u001b[2J\u202eb {command}', { command: 'ls' })).toBe('a[2Jb ls')
  expect(fill('a؜b', {})).toBe('ab')
  const long = fill('{file}', { file: 'x'.repeat(80) })
  expect([...long]).toHaveLength(40)
  expect(long.endsWith('…')).toBe(true)
})

test('pickLine never repeats the last line when there is a choice', async () => {
  const lines = ['a', 'b', 'c']
  for (const r of [0, 0.4, 0.99]) expect(pickLine(lines, 'b', () => r)).not.toBe('b')
  expect(pickLine(['only'], 'only', () => 0)).toBe('only')
})

test('bubbleFor has lines for the three shown moods', async () => {
  for (const mood of ['done', 'fail', 'needs-you'] as const) {
    expect(CLAWD_SAY[mood].length).toBeGreaterThan(1)
    const b = bubbleFor(mood, { n: 3, command: 'npm' }, undefined, () => 0)
    expect(b.text.length).toBeGreaterThan(0)
    expect(CLAWD_SAY[mood]).toContain(b.template)
  }
})
