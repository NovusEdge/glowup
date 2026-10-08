import { test, expect } from 'claude-code/testing'
import { levelOf, xpToReach, turnXp, isCommitCommand, UNLOCKS, unlocksBetween, parseLevelStore, levelStore, levelUp, groupDigits } from '../hooks/levels.ts'

test('the curve: 100 x n per level, endless', async () => {
  expect(levelOf(0)).toEqual({ level: 1, into: 0, need: 100 })
  expect(levelOf(99)).toEqual({ level: 1, into: 99, need: 100 })
  expect(levelOf(100)).toEqual({ level: 2, into: 0, need: 200 })
  expect(levelOf(4500)).toEqual({ level: 10, into: 0, need: 1000 })
  expect(levelOf(19_000).level).toBe(20)
  for (const L of [1, 2, 10, 37]) expect(levelOf(xpToReach(L)).level).toBe(L)
})

test('turn XP: answered base, capped combo, green, capped commits', async () => {
  expect(turnXp({ answered: true, combo: 0, green: 0, commits: 0 })).toBe(5)
  expect(turnXp({ answered: true, combo: 50, green: 0, commits: 0 })).toBe(25)
  expect(turnXp({ answered: true, combo: 3, green: 1, commits: 5 })).toBe(5 + 3 + 15 + 30)
  expect(turnXp({ answered: false, combo: 9, green: 1, commits: 1 })).toBe(25)
})

test('commit detection', async () => {
  for (const c of ['git commit -m x', 'git -C sub commit -s', 'A=1 git commit', 'git add . && git commit -m y', 'npm test; git commit -am z'])
    expect({ c, ok: isCommitCommand(c) }).toEqual({ c, ok: true })
  for (const c of ['git commit --dry-run', 'git log', 'echo git commit', 'git commit-tree abc', 'gitx commit'])
    expect({ c, ok: isCommitCommand(c) }).toEqual({ c, ok: false })
})

test('unlocks: the table and the ones a jump crosses', async () => {
  expect(UNLOCKS.map(u => `${u.level}:${u.kind}`)).toEqual(['2:lines', '3:outfit', '4:lines', '5:idle', '6:outfit', '7:lines', '8:outfit', '10:idle'])
  expect(unlocksBetween(1, 2).map(u => u.level)).toEqual([2])
  expect(unlocksBetween(3, 6).map(u => u.level)).toEqual([4, 5, 6])
  expect(unlocksBetween(10, 14)).toEqual([])
})

test('the store record: malformed reads as 0', async () => {
  expect(parseLevelStore({ format: 1, xp: 250 })).toBe(250)
  for (const bad of [undefined, null, 'x', { xp: -1 }, { xp: 1.5 }, { xp: NaN }, { format: 2, xp: 10 }, { format: 1 }])
    expect(parseLevelStore(bad)).toBe(0)
  expect(levelStore(42)).toEqual({ format: 1, xp: 42 })
})

test('levelUp: none, one level, a jump across two, art not ready', async () => {
  expect(levelUp(50, 99)).toBeUndefined()
  expect(levelUp(95, 100)).toEqual({ level: 2, unlock: 'new lines' })
  // 290 -> 1,000: level 2 -> 5 crosses 3 (outfit), 4 (lines), 5 (idle); only lines ship in PR A
  expect(levelUp(290, 1000)).toEqual({ level: 5, unlock: 'new lines' })
  // 300 -> 310 stays level 3; 250 -> 300 reaches 3, whose only unlock is an outfit
  expect(levelUp(250, 300)).toEqual({ level: 3, unlock: undefined })
  expect(levelUp(4500, 6000)).toEqual({ level: 11, unlock: undefined })
  expect(levelOf(-5)).toEqual({ level: 1, into: 0, need: 100 })
  expect(groupDigits(2310)).toBe('2,310')
  expect(groupDigits(950)).toBe('950')
  expect(groupDigits(1234567)).toBe('1,234,567')
})

test('non-finite xp counts as 0', async () => {
  expect(levelOf(Infinity)).toEqual(levelOf(0))
  expect(levelOf(NaN)).toEqual(levelOf(0))
})
