// JSX-free: the docs site imports it.
import type { Mood } from './bubbles.ts'
import { shown } from './themes.ts'

export const BAND_ITEMS = ['combo', 'agents', 'meter', 'plan'] as const
export type BandItem = (typeof BAND_ITEMS)[number]
export const TAB_IDS = ['plan', 'agents', 'diff', 'changes'] as const
export type TabId = (typeof TAB_IDS)[number]
export const SETUP_MOODS: readonly Mood[] = ['needs-you', 'fail', 'done']
export type Meter = { warn: number; danger: number }
export type Setup = { format: 1; band: BandItem[]; tabs: TabId[]; meter: Meter; bubbles: { moods: Mood[]; ms: number }; pet: { sleepMs: number } }

export const DEFAULT_SETUP: Setup = {
  format: 1,
  band: ['combo', 'agents', 'meter', 'plan'],
  tabs: ['plan', 'agents', 'diff', 'changes'],
  meter: { warn: 50, danger: 80 },
  bubbles: { moods: ['needs-you', 'fail', 'done'], ms: 3000 },
  pet: { sleepMs: 60_000 },
}

export const SETUP_KEYS = ['band', 'tabs', 'meter.warn', 'meter.danger', 'bubbles.moods', 'bubbles.ms', 'pet.sleepMs'] as const

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const whole = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi

// Ids this build does not know are dropped with a notice: a setup saved by a later glowup still loads.
function ids<T extends string>(v: unknown, known: readonly T[], what: string, notices: string[]): T[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: T[] = []
  for (const x of v) {
    if (typeof x === 'string' && (known as readonly string[]).includes(x)) { if (!out.includes(x as T)) out.push(x as T) }
    else notices.push(`unknown ${what} "${shown(String(x))}"`)
  }
  return out
}

const OLD_DEFAULT_TABS = 'changes,agents,plan'

export function parseSetup(raw: unknown): { setup: Setup; notices: string[] } {
  const d = DEFAULT_SETUP, notices: string[] = []
  if (raw === undefined) return { setup: d, notices }
  if (!isObj(raw)) return { setup: d, notices: ['setup must be an object'] }

  let band = d.band
  if (raw.band !== undefined) {
    const got = ids(raw.band, BAND_ITEMS, 'band item', notices)
    if (got) band = got
    else notices.push(`band must be a list of: ${BAND_ITEMS.join(', ')}`)
  }

  let tabs = d.tabs
  if (raw.tabs !== undefined) {
    const got = ids(raw.tabs, TAB_IDS, 'tab', notices)
    // Saving any setup field stored the tabs too, so the pre-0.11 default order is the default, not a choice.
    if (got?.length) tabs = got.join() === OLD_DEFAULT_TABS ? d.tabs : got
    else notices.push(`tabs must name at least one of: ${TAB_IDS.join(', ')}`)
  }

  let meter = d.meter
  if (raw.meter !== undefined) {
    const m = isObj(raw.meter) ? raw.meter : {}
    const warn = m.warn ?? d.meter.warn, danger = m.danger ?? d.meter.danger
    if (!whole(warn, 1, 99)) notices.push('meter.warn must be a whole number from 1 to 99')
    else if (!whole(danger, 1, 99)) notices.push('meter.danger must be a whole number from 1 to 99')
    else if (warn >= danger) notices.push('meter.warn must be below meter.danger')
    else meter = { warn, danger }
  }

  const b = isObj(raw.bubbles) ? raw.bubbles : {}
  let moods = d.bubbles.moods
  if (b.moods !== undefined) {
    const got = ids(b.moods, SETUP_MOODS, 'mood', notices)
    if (got) moods = got
    else notices.push(`bubbles.moods must be a list of: ${SETUP_MOODS.join(', ')}`)
  }
  let ms = d.bubbles.ms
  if (b.ms !== undefined) {
    if (whole(b.ms, 1500, 10_000)) ms = b.ms
    else notices.push('bubbles.ms must be a whole number from 1500 to 10000')
  }

  const p = isObj(raw.pet) ? raw.pet : {}
  let sleepMs = d.pet.sleepMs
  if (p.sleepMs !== undefined) {
    if (whole(p.sleepMs, 15_000, 600_000)) sleepMs = p.sleepMs
    else notices.push('pet.sleepMs must be a whole number from 15000 to 600000')
  }

  return { setup: { format: 1, band, tabs, meter, bubbles: { moods, ms }, pet: { sleepMs } }, notices }
}

const list = (v: string) => (v === 'none' ? [] : v.split(',').map(s => s.trim()).filter(Boolean))

// A typed value is strict: what parseSetup would drop with a notice is refused here.
export function setSetupField(s: Setup, key: string, value: string): { setup: Setup } | { error: string } {
  const num = Number(value)
  const next: Record<string, unknown> = JSON.parse(JSON.stringify(s))
  const meter = next.meter as Record<string, unknown>, bubbles = next.bubbles as Record<string, unknown>, pet = next.pet as Record<string, unknown>
  switch (key) {
    case 'band': next.band = list(value); break
    case 'tabs': next.tabs = list(value); break
    case 'meter.warn': meter.warn = num; break
    case 'meter.danger': meter.danger = num; break
    case 'bubbles.moods': bubbles.moods = list(value); break
    case 'bubbles.ms': bubbles.ms = num; break
    case 'pet.sleepMs': pet.sleepMs = num; break
    default: return { error: `Unknown setup key "${shown(key)}". Keys: ${SETUP_KEYS.join(', ')}.` }
  }
  const r = parseSetup(next)
  return r.notices.length ? { error: r.notices[0]! } : { setup: r.setup }
}

const shownList = (xs: readonly string[]) => (xs.length ? xs.join(', ') : 'none')

export function describeSetup(s: Setup): string {
  const rows: [string, string][] = [
    ['band', shownList(s.band)],
    ['tabs', shownList(s.tabs)],
    ['meter.warn', String(s.meter.warn)],
    ['meter.danger', String(s.meter.danger)],
    ['bubbles.moods', shownList(s.bubbles.moods)],
    ['bubbles.ms', String(s.bubbles.ms)],
    ['pet.sleepMs', String(s.pet.sleepMs)],
  ]
  return rows.map(([k, v]) => `${k.padEnd(15)}${v}`).join('\n')
}

export const toneFor = (p: number, m: Meter): 'pass' | 'edit' | 'fail' => (p >= m.danger ? 'fail' : p >= m.warn ? 'edit' : 'pass')
