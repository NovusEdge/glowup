import { test, expect } from 'claude-code/testing'
import { renderFields, parseFields, DEFAULT_FIELDS, FIELD_IDS } from '../hooks/fields.ts'
import { initialModel, type Model } from '../hooks/model.ts'
import { resolveTheme } from '../hooks/themes.ts'

const T = resolveTheme('classic', {}).theme
const NOW = Date.parse('2026-10-07T12:00:00Z') // a Wednesday
const plain = (m: Model, fields = DEFAULT_FIELDS, now = NOW, tzOffset = 0) => renderFields(m, T, fields, { now, tzOffset, color: 'plain' })
const at = (mins: number) => new Date(NOW + mins * 60_000).toISOString()
const lim = (kind: string, percentUsed: number, resetsAt?: string) => ({ kind, percentUsed, resetsAt })

test('default fields on a fresh model show only activity', () => {
  expect(plain(initialModel())).toBe('◆ idle')
})

test('each field renders, and is omitted without data', () => {
  const m: Model = {
    ...initialModel(), working: true, ctxPercent: 48, act: { glyph: '✎', label: 'Editing a.ts', tone: 'edit' },
    limits: [lim('five_hour', 23, at(130)), lim('seven_day', 61, at(60 * 24 * 2))], costUsd: 1.234,
    modelName: 'claude-opus-5-5', root: '/w/glowup', branch: 'main',
    agents: [{ key: 'a', name: 'x', task: '', state: 'running', startedAt: 0 }, { key: 'b', name: 'y', task: '', state: 'running', startedAt: 0 }],
    plan: [{ id: '1', title: 'a', status: 'completed' }, { id: '2', title: 'b', status: 'pending' }],
    files: [{ path: 'a', add: 40, del: 7, how: 'edit', at: 0 }, { path: 'b', add: 2, del: 0, how: 'edit', at: 0 }],
  }
  expect(plain(m, FIELD_IDS)).toBe('◆ editing · ctx 48% · 5h 23% ↻2h10m · wk 61% ↻Fri · $1.23 · claude-opus-5-5 · 2 agents · plan 1/2 · main · +42 −7 · glowup')
  const empty: Model = { ...initialModel(), root: '/w/glowup' }
  expect(plain(empty, FIELD_IDS)).toBe('◆ idle · glowup')
  expect(plain({ ...empty, agents: [{ key: 'a', name: 'x', task: '', state: 'running', startedAt: 0 }] }, ['agents'])).toBe('1 agent')
})

test('reset times: under a minute, under an hour, under a day, beyond, past, missing, unparsable', () => {
  const five = (resetsAt?: string) => plain({ ...initialModel(), limits: [lim('five_hour', 10, resetsAt)] }, ['5h'])
  expect(five(at(0.5))).toBe('5h 10% ↻<1m')
  expect(five(at(59))).toBe('5h 10% ↻59m')
  expect(five(at(60 * 23 + 59))).toBe('5h 10% ↻23h59m')
  expect(five(at(-1))).toBe('')
  expect(five(undefined)).toBe('5h 10%')
  expect(five('not a date')).toBe('5h 10%')
})

test('the weekday uses tzOffset, not the process timezone', () => {
  // the reset is Thursday 21:30 UTC, which is Friday 00:30 at +180
  const resets = '2026-10-08T21:30:00Z'
  const m = { ...initialModel(), limits: [lim('seven_day', 5, resets)] }
  const now = Date.parse('2026-10-06T21:30:00Z')
  expect(plain(m, ['week'], now, 0)).toBe('wk 5% ↻Thu')
  expect(plain(m, ['week'], now, 180)).toBe('wk 5% ↻Fri')
})

test('an all-empty render is an empty string', () => {
  expect(plain(initialModel(), ['5h', 'branch'])).toBe('')
})

test('colors: thresholds and both escape forms', () => {
  const pct = (p: number, color: 'truecolor' | '256') => renderFields({ ...initialModel(), limits: [lim('five_hour', p)] }, T, ['5h'], { now: NOW, tzOffset: 0, color })
  const tc = (hex: string) => `\x1b[38;2;${parseInt(hex.slice(1, 3), 16)};${parseInt(hex.slice(3, 5), 16)};${parseInt(hex.slice(5, 7), 16)}m`
  expect(pct(49, 'truecolor')).toContain(tc(T.colors.pass) + '49%')
  expect(pct(50, 'truecolor')).toContain(tc(T.colors.edit) + '50%')
  expect(pct(79, 'truecolor')).toContain(tc(T.colors.edit) + '79%')
  expect(pct(80, 'truecolor')).toContain(tc(T.colors.fail) + '80%')
  expect(pct(80, '256')).toMatch(/\x1b\[38;5;\d+m80%/)
  expect(pct(80, 'truecolor')).toContain('\x1b[39m')
  expect(plain({ ...initialModel(), limits: [lim('five_hour', 80)] }, ['5h'])).not.toContain('\x1b')
})

test('parseFields: arrays and strings, unknown dropped, repeats keep the first, empty is undefined', () => {
  expect(parseFields(['5h', 'week', '5h'])).toEqual(['5h', 'week'])
  expect(parseFields(' activity, ctx ,nope')).toEqual(['activity', 'ctx'])
  expect(parseFields(['nope'])).toBeUndefined()
  expect(parseFields('')).toBeUndefined()
  expect(parseFields(42)).toBeUndefined()
})
