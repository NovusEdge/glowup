import { test, expect } from 'claude-code/testing'
import { recordPass, isDeployCommand, fridayDeploy, parseOffset, localOffset, localTime, overlays, SHINY_RUNS, type LocalTime } from '../hooks/eggs.ts'

test('recordPass counts and unlocks once at 100', async () => {
  let s = { passRuns: SHINY_RUNS - 2 }
  let r = recordPass(s, 1); expect(r.unlocked).toBe(false); s = r.next
  r = recordPass(s, 2); expect(r.unlocked).toBe(true); expect(r.next).toEqual({ passRuns: 100, shinyAt: 2 })
  r = recordPass(r.next, 3); expect(r.unlocked).toBe(false); expect(r.next.shinyAt).toBe(2)
  expect(recordPass(undefined, 0).next.passRuns).toBe(1)
})

test('deploy commands', async () => {
  for (const c of ['git push', 'git push origin main', 'npm run deploy', 'pnpm deploy', 'vercel --prod', 'fly deploy', 'netlify deploy --prod', 'firebase deploy', 'pulumi up', 'terraform apply', 'kubectl apply -f x.yaml', 'npm test && git push', 'CI=1 git push', 'npm test\ngit push', 'sleep 1 & git push'])
    expect(isDeployCommand(c)).toBe(true)
  for (const c of ['git pushd', 'vercel', 'echo git push', 'netlify deploy', 'git status']) expect(isDeployCommand(c)).toBe(false)
})

const at = (iso: string, off = 0) => localTime(Date.parse(iso), off)

test('friday deploy only on Friday from 15:00', async () => {
  expect(fridayDeploy('git push', at('2026-10-02T15:00:00Z'))).toBe(true)
  expect(fridayDeploy('git push', at('2026-10-02T14:59:00Z'))).toBe(false)
  expect(fridayDeploy('git push', at('2026-10-03T16:00:00Z'))).toBe(false)
})

test('offsets: getTimezoneOffset first, date +%z only when it is 0', async () => {
  expect(parseOffset('+0300\n')).toBe(180)
  expect(parseOffset('-0530')).toBe(-330)
  expect(parseOffset('garbage')).toBe(0)
  expect(localOffset(-120, '+0900')).toBe(120)
  expect(localOffset(0, '+0900')).toBe(540)
  expect(localOffset(0, undefined)).toBe(0)
  expect(at('2026-10-02T13:00:00Z', 180)).toEqual({ year: 2026, month: 10, date: 2, day: 5, hour: 16 })
})

test('overlays', async () => {
  const none: LocalTime | undefined = undefined
  expect(overlays(at('2026-12-24T12:00:00Z'), none, false)).toEqual(['santa'])
  expect(overlays(at('2026-12-19T12:00:00Z'), none, false)).toEqual([])
  expect(overlays(at('2026-12-20T12:00:00Z'), none, false)).toEqual(['santa'])
  expect(overlays(at('2026-10-24T12:00:00Z'), none, false)).toEqual([])
  expect(overlays(at('2026-10-25T12:00:00Z'), none, false)).toEqual(['pumpkin'])
  expect(overlays(at('2026-07-01T01:59:00Z'), none, false)).toEqual([])
  expect(overlays(at('2026-07-01T02:00:00Z'), none, false)).toEqual(['nightcap'])
  expect(overlays(at('2027-12-24T12:00:00Z'), at('2026-12-24T09:00:00Z'), false)).toEqual(['santa'])
  expect(overlays(at('2026-10-31T12:00:00Z'), none, false)).toEqual(['pumpkin'])
  expect(overlays(at('2027-03-05T12:00:00Z'), at('2026-03-05T09:00:00Z'), false)).toEqual(['party'])
  expect(overlays(at('2026-03-05T12:00:00Z'), at('2026-03-05T09:00:00Z'), false)).toEqual([])
  expect(overlays(at('2026-07-01T03:00:00Z'), none, false)).toEqual(['nightcap'])
  expect(overlays(at('2026-07-01T05:00:00Z'), none, false)).toEqual([])
  expect(overlays(at('2026-07-03T16:00:00Z'), none, true)).toEqual(['sweat', 'friday'])
})
