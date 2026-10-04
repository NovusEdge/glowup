import { test, expect } from 'claude-code/testing'
import { fill, pickLine, bubbleFor, sanitizeLine, haikuPrompt, HaikuGate, CLAWD_SAY } from '../hooks/bubbles.ts'

test('fill replaces placeholders, strips unsafe characters and caps at 40', async () => {
  expect(fill('{n}/{n} green', { n: 12 })).toBe('12/12 green')
  expect(fill('editing {file}', {})).toBe('editing …')
  expect(fill('a\u001b[2J\u202eb {command}', { command: 'ls' })).toBe('a[2Jb ls')
  expect(fill(`a${String.fromCharCode(0x061c)}b`, {})).toBe('ab')
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

test('sanitizeLine keeps one plain line of at most 40 characters', async () => {
  expect(sanitizeLine('  "all   done"\n second line ')).toBe('all done')
  expect(sanitizeLine('nice \u001b[31mwork\u0007 🎉')).toBe('nice [31mwork')
  expect(sanitizeLine("that's a wrap")).toBe("that's a wrap")
  expect(sanitizeLine('\n\nfirst\nsecond')).toBe('first')
  expect([...sanitizeLine('x'.repeat(90))]).toHaveLength(40)
  expect(sanitizeLine('"" \n 🎉')).toBe('')
})

test('haikuPrompt carries only glowup state, capped', async () => {
  const { system, prompt } = haikuPrompt({ mood: 'fail', pose: 'shell', label: 'npm test with a very long label that goes on', tests: 'failed 3', daypart: 'evening' })
  expect(prompt).toContain('mood: fail')
  expect(prompt).toContain('tests: failed 3')
  expect(prompt).toContain('time: evening')
  expect([...prompt.split('\n').find(l => l.startsWith('doing: '))!.slice(7)].length).toBeLessThanOrEqual(40)
  expect(system).toContain('40 characters')
})

test('the gate allows one call in flight, one per turn, 90 s apart', async () => {
  const g = new HaikuGate()
  expect(g.take(1, 1000)).toBe(true)
  expect(g.take(1, 1000)).toBe(false)
  g.done()
  expect(g.take(1, 1000)).toBe(false)
  expect(g.take(2, 1000 + 89_999)).toBe(false)
  expect(g.take(2, 1000 + 90_000)).toBe(true)
  g.reset()
  expect(g.take(3, 1000 + 90_001)).toBe(false)
  g.done()
  expect(g.take(3, 1000 + 180_000)).toBe(true)
})
