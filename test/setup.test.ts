import { test, expect } from 'claude-code/testing'
import { DEFAULT_SETUP, parseSetup, setSetupField, describeSetup, toneFor, type Setup } from '../hooks/setup.ts'

test('no stored setup is the default with no notices', () => {
  expect(parseSetup(undefined)).toEqual({ setup: DEFAULT_SETUP, notices: [] })
})

test('a full valid setup round-trips', () => {
  const s: Setup = { format: 1, band: ['plan', 'meter'], tabs: ['plan', 'changes'], meter: { warn: 40, danger: 90 }, bubbles: { moods: ['done'], ms: 5000 }, pet: { sleepMs: 120000 } }
  expect(parseSetup(JSON.parse(JSON.stringify(s)))).toEqual({ setup: s, notices: [] })
})

test('a setup from a later glowup loads with notices for what it does not know', () => {
  const r = parseSetup({ format: 2, band: ['plan', 'weather'], tabs: ['agents', 'timeline'], bubbles: { moods: ['done', 'cheer'] }, sound: { on: true } })
  expect(r.setup.band).toEqual(['plan'])
  expect(r.setup.tabs).toEqual(['agents'])
  expect(r.setup.bubbles.moods).toEqual(['done'])
  expect(r.setup.meter).toEqual(DEFAULT_SETUP.meter)
  expect(r.notices).toEqual(['unknown band item "weather"', 'unknown tab "timeline"', 'unknown mood "cheer"'])
})

test('bad values fall back per field with a notice', () => {
  const r = parseSetup({ band: 'plan', tabs: [], meter: { warn: 80, danger: 50 }, bubbles: { ms: 200 }, pet: { sleepMs: 'soon' } })
  expect(r.setup).toEqual(DEFAULT_SETUP)
  expect(r.notices).toEqual([
    'band must be a list of: combo, agents, meter, plan',
    'tabs must name at least one of: plan, agents, diff, changes',
    'meter.warn must be below meter.danger',
    'bubbles.ms must be a whole number from 1500 to 10000',
    'pet.sleepMs must be a whole number from 15000 to 600000',
  ])
})

test('the default tabs open on plan and the diff tab is a valid choice', () => {
  expect(DEFAULT_SETUP.tabs).toEqual(['plan', 'agents', 'diff', 'changes'])
  expect(parseSetup({ tabs: ['diff', 'changes'] })).toEqual({ setup: { ...DEFAULT_SETUP, tabs: ['diff', 'changes'] }, notices: [] })
  expect(setSetupField(DEFAULT_SETUP, 'tabs', 'diff,plan')).toMatchObject({ setup: { tabs: ['diff', 'plan'] } })
})

test('a non-object stored setup is the default with a notice', () => {
  expect(parseSetup('band=plan')).toEqual({ setup: DEFAULT_SETUP, notices: ['setup must be an object'] })
})

test('an empty band and empty moods are choices, not errors', () => {
  const r = parseSetup({ band: [], bubbles: { moods: [] } })
  expect(r.notices).toEqual([])
  expect(r.setup.band).toEqual([])
  expect(r.setup.bubbles.moods).toEqual([])
})

test('setSetupField sets lists, numbers and none', () => {
  const a = setSetupField(DEFAULT_SETUP, 'band', 'plan,meter')
  expect('setup' in a && a.setup.band).toEqual(['plan', 'meter'])
  const b = setSetupField(DEFAULT_SETUP, 'bubbles.moods', 'none')
  expect('setup' in b && b.setup.bubbles.moods).toEqual([])
  const c = setSetupField(DEFAULT_SETUP, 'meter.warn', '60')
  expect('setup' in c && c.setup.meter).toEqual({ warn: 60, danger: 80 })
})

test('setSetupField refuses what parseSetup would only warn about', () => {
  expect(setSetupField(DEFAULT_SETUP, 'band', 'plan,weather')).toEqual({ error: 'unknown band item "weather"' })
  expect(setSetupField(DEFAULT_SETUP, 'meter.warn', '85')).toEqual({ error: 'meter.warn must be below meter.danger' })
  expect(setSetupField(DEFAULT_SETUP, 'meter.danger', '1.5')).toEqual({ error: 'meter.danger must be a whole number from 1 to 99' })
  expect(setSetupField(DEFAULT_SETUP, 'colour', 'x')).toEqual({ error: 'Unknown setup key "colour". Keys: band, tabs, meter.warn, meter.danger, bubbles.moods, bubbles.ms, pet.sleepMs.' })
})

test('describeSetup lists every key with its value', () => {
  expect(describeSetup(DEFAULT_SETUP)).toBe([
    'band           combo, agents, meter, plan',
    'tabs           plan, agents, diff, changes',
    'meter.warn     50',
    'meter.danger   80',
    'bubbles.moods  needs-you, fail, done',
    'bubbles.ms     3000',
    'pet.sleepMs    60000',
  ].join('\n'))
  expect(describeSetup({ ...DEFAULT_SETUP, band: [] })).toContain('band           none')
})

test('toneFor uses the meter', () => {
  const m = { warn: 50, danger: 80 }
  expect([0, 49, 50, 79, 80, 100].map(p => toneFor(p, m))).toEqual(['pass', 'pass', 'edit', 'edit', 'fail', 'fail'])
  expect(toneFor(30, { warn: 20, danger: 30 })).toBe('fail')
})
