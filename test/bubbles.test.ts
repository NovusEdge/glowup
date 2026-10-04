import { test, expect } from 'claude-code/testing'
import { fill, pickLine, bubbleFor, sanitizeLine, fitsBubble, haikuMaxTokens, haikuPrompt, haikuLimit, wrapBubble, HaikuGate, kindWords, CLAWD_SAY } from '../hooks/bubbles.ts'

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

test('sanitizeLine keeps one plain line and never shortens it', async () => {
  expect(sanitizeLine('  "all   done"\n second line ')).toBe('all done')
  expect(sanitizeLine('nice \u001b[31mwork\u0007 🎉')).toBe('nice [31mwork')
  expect(sanitizeLine("that's a wrap")).toBe("that's a wrap")
  expect(sanitizeLine('\n\nfirst\nsecond')).toBe('first')
  expect([...sanitizeLine('x'.repeat(90))]).toHaveLength(90)
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
  let at = -Infinity
  const take = (turn: number, now: number) => { const ok = g.take(turn, now, at); if (ok) at = now; return ok }
  expect(take(1, 1000)).toBe(true)
  expect(take(1, 1000)).toBe(false)
  g.done()
  expect(take(1, 1000)).toBe(false)
  expect(take(2, 1000 + 89_999)).toBe(false)
  expect(take(2, 1000 + 90_000)).toBe(true)
  g.reset()
  expect(take(3, 1000 + 90_001)).toBe(false)
  g.done()
  expect(take(3, 1000 + 180_000)).toBe(true)
  expect(new HaikuGate().take(1, 5000, 5000 - 89_999)).toBe(false)
})

test('kind words name the kind of work and nothing the person typed', async () => {
  expect(kindWords('edit')).toBe('editing a file')
  expect(kindWords('shell')).toBe('running a command')
  expect(kindWords('think')).toBeUndefined()
  expect(kindWords(undefined)).toBeUndefined()
})

test('wrapBubble wraps at spaces and cuts at a word with an ellipsis', async () => {
  expect(wrapBubble('all done', 20, 2)).toEqual(['all done'])
  expect(wrapBubble('hmm tests are sulking today', 14, 2)).toEqual(['hmm tests are', 'sulking today'])
  expect(wrapBubble('hmm tests are sulking today and more', 14, 2)).toEqual(['hmm tests are', 'sulking today…'])
  expect(wrapBubble('all done and a lot more words', 12, 1)).toEqual(['all done…'])
  expect(wrapBubble('abcdefghijklmnop', 8, 2)).toEqual(['abcdefg…'])
})

test('the Haiku limit follows the room, capped at 40, and reaches the prompt and the sanitizer', async () => {
  expect(haikuLimit(undefined)).toBe(40)
  expect(haikuLimit(60)).toBe(40)
  expect(haikuLimit(20)).toBe(38)
  expect(haikuLimit(10)).toBe(18)
  expect(haikuLimit(3)).toBe(12)
  expect(haikuLimit(10, 1)).toBe(12)
  expect(haikuPrompt({ mood: 'done', pose: 'idle', daypart: 'night', limit: 18 }).system).toContain('at most 18 characters')
  expect(haikuPrompt({ mood: 'done', pose: 'idle', daypart: 'night', limit: 18 }).system).toContain('one short complete sentence')
  expect(fitsBubble('x'.repeat(18), 18)).toBe(true)
  expect(fitsBubble('x'.repeat(19), 18)).toBe(false)
  expect(fitsBubble('x'.repeat(41), 90)).toBe(false)
  expect(haikuMaxTokens(18)).toBe(40)
  expect(haikuMaxTokens(40)).toBe(40)
  expect(haikuMaxTokens(90)).toBe(60)
})
