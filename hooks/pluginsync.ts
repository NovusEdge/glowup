import type { Host } from './host.ts'
import { DEFAULT_FIELDS, parseFields } from './fields.ts'

export const SEEN_KEY = 'plugin-seen'

type Seen = { pack?: string; theme?: string; spinner?: string; pet?: string; bubbles?: string; statusline?: string; reducedMotion?: boolean }
type Key = keyof Seen
// The order commands run in: a pack change clears overrides, so a theme or spinner changed
// in the same edit must land after it.
const KEYS: readonly Key[] = ['pack', 'theme', 'spinner', 'pet', 'bubbles', 'statusline', 'reducedMotion']

// Whitespace and comma noise in /plugin must not count as a change. An unparsable
// statusline is the default list, which is what the mod falls back to.
function normalize(o: Readonly<Record<string, unknown>> | undefined): Seen {
  const out: Seen = {}
  for (const k of KEYS) {
    const v = o?.[k]
    if (k === 'reducedMotion') { if (typeof v === 'boolean') out[k] = v }
    else if (k === 'statusline') { if (typeof v === 'string' || Array.isArray(v)) out[k] = (parseFields(v) ?? DEFAULT_FIELDS).join(',') }
    else if (typeof v === 'string') out[k] = v.trim()
  }
  return out
}

export function changedOptions(seen: unknown, options: Readonly<Record<string, unknown>>): { key: Key; value: string | boolean }[] {
  if (seen === undefined || seen === null || typeof seen !== 'object') return []
  const was = normalize(seen as Record<string, unknown>), now = normalize(options)
  return KEYS.flatMap(key => now[key] !== undefined && now[key] !== was[key] ? [{ key, value: now[key]! }] : [])
}

// `spinner pack` is the userConfig spelling of "the pack's own", which the command calls default.
function commandFor(key: Key, value: string | boolean): { cmd: string; ok: string } | undefined {
  if (key === 'reducedMotion') return { cmd: `motion ${value ? 'reduced' : 'full'}`, ok: 'Motion: ' }
  if (value === '') return undefined
  if (key === 'spinner') return { cmd: `spinner ${value === 'pack' ? 'default' : value}`, ok: 'Spinner: ' }
  if (key === 'statusline') return { cmd: `statusline fields ${String(value).split(',').join(' ')}`, ok: 'Status line fields: ' }
  return { cmd: `${key} ${value}`, ok: { pack: 'Pack: ', theme: 'Theme: ', pet: 'Pet: ', bubbles: 'Bubbles: ' }[key]! }
}

const label = (key: Key, value: string | boolean) => key === 'reducedMotion' ? `motion ${value ? 'reduced' : 'full'}` : `${key} ${value}`

// A /plugin edit and a /glowup command both write the same saved choice, and the later one wins:
// an edit is detected by comparing /plugin's values with the ones seen last session. Returns the toast.
export async function syncPlugin(host: Host, options: Readonly<Record<string, unknown>>, run: (cmd: string) => Promise<string>): Promise<string | undefined> {
  const seen = await host.storeGet(SEEN_KEY)
  const changes = changedOptions(seen, options)
  // recorded even when a command fails, so a bad value is reported once and not every session
  await host.storeSet(SEEN_KEY, { ...normalize(seen as Record<string, unknown> | undefined), ...normalize(options) })
  const applied: string[] = [], failed: string[] = []
  for (const { key, value } of changes) {
    const c = commandFor(key, value)
    if (!c) continue
    const r = await run(c.cmd).catch((err: unknown) => err instanceof Error ? err.message : String(err))
    if (r.startsWith(c.ok)) applied.push(label(key, value)); else failed.push(`${label(key, value)}: ${r.split('\n')[0]}`)
  }
  if (!applied.length && !failed.length) return undefined
  return [applied.length ? `Applied from /plugin: ${applied.join(', ')}.` : '', failed.length ? `Not applied: ${failed.join('; ')}` : ''].filter(Boolean).join(' ')
}
