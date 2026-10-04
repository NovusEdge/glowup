import { PRESETS } from './presets.ts'
import { cellWidth } from './layout.tsx'
export { PRESETS }

export const MAX_THEME_BYTES = 65536
const COLOR_KEYS = ['accent', 'text', 'dim', 'faint', 'read', 'edit', 'shell', 'agent', 'pass', 'fail', 'panel', 'addBg', 'delBg', 'sel'] as const
const GLYPH_KEYS = ['read', 'search', 'edit', 'shell', 'agent', 'plan'] as const
export type Colors = Record<(typeof COLOR_KEYS)[number], string>
export type Theme = { name: string; colors: Colors; spinnerWords: string[]; glyphs: Record<(typeof GLYPH_KEYS)[number], string>; hearts: [string, string] }
export type ThemeFile = { name: string; extends?: string; colors?: Partial<Colors>; spinner?: { words?: string[] }; glyphs?: Partial<Theme['glyphs']>; band?: { hearts?: [string, string] } }

export function parseJsonc(text: string): unknown {
  if (new TextEncoder().encode(text).length > MAX_THEME_BYTES) throw new Error(`file is over ${MAX_THEME_BYTES} bytes`)
  let out = '', i = 0, inStr = false
  while (i < text.length) {
    const c = text[i]!, n = text[i + 1]
    if (inStr) { out += c; if (c === '\\') { out += n ?? ''; i += 2; continue } if (c === '"') inStr = false; i++; continue }
    if (c === '"') { inStr = true; out += c; i++; continue }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') {
      const end = text.indexOf('*/', i + 2)
      if (end < 0) throw new Error('unterminated /* comment')
      out += ' '; i = end + 2; continue
    }
    out += c; i++
  }
  try { return JSON.parse(out) } catch (err) { throw new Error('not valid JSON: ' + (err as Error).message) }
}

// Downloaded themes reach the terminal, so anything that moves the cursor, hides text or
// is not a scalar value is out: C0/C1 controls, zero-width and bidi marks, surrogates.
const UNSAFE: [number, number][] = [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202f], [0x2060, 0x206f], [0xfeff, 0xfeff], [0xd800, 0xdfff]]
const isUnsafe = (cp: number) => UNSAFE.some(([lo, hi]) => cp >= lo && cp <= hi)

// Below U+FFFF and width 1: the engine refuses glyph cells of any other width.
function isGlyph(s: unknown): boolean {
  if (typeof s !== 'string' || [...s].length !== 1) return false
  const cp = s.codePointAt(0)!
  return cp <= 0xffff && cellWidth(cp) === 1 && !isUnsafe(cp)
}
const isWord = (w: unknown) => typeof w === 'string' && w.length <= 24 && [...w].every(c => !isUnsafe(c.codePointAt(0)!))

// Keys and theme names come from downloaded files and end up in toasts and
// command output, so they are echoed without control characters and capped.
const shown = (s: string) => [...s].filter(c => !isUnsafe(c.codePointAt(0)!)).join('').slice(0, 40)

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function validate(file: unknown): asserts file is ThemeFile {
  if (typeof file !== 'object' || file === null || Array.isArray(file)) throw new Error('a theme must be a JSON object')
  const f = file as Record<string, unknown>
  if (f.extends !== undefined && typeof f.extends !== 'string') throw new Error('"extends" must be a theme name')
  const colors = (f.colors ?? {}) as Record<string, unknown>
  for (const [k, v] of Object.entries(colors)) {
    if (!(COLOR_KEYS as readonly string[]).includes(k)) throw new Error(`unknown color "${shown(k)}"`)
    if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`color "${k}" must be #rrggbb`)
  }
  if (f.glyphs !== undefined && !isPlain(f.glyphs)) throw new Error('"glyphs" must be an object')
  for (const [k, v] of Object.entries(f.glyphs ?? {})) {
    if (!(GLYPH_KEYS as readonly string[]).includes(k)) throw new Error(`unknown glyph "${shown(k)}"`)
    if (!isGlyph(v)) throw new Error(`glyph "${k}" must be one width-1 character`)
  }
  const hearts = (f.band as { hearts?: unknown } | undefined)?.hearts
  if (hearts !== undefined && (!Array.isArray(hearts) || hearts.length !== 2 || !hearts.every(isGlyph))) throw new Error('band.hearts must be two width-1 characters')
  const words = (f.spinner as { words?: unknown } | undefined)?.words
  if (words !== undefined && (!Array.isArray(words) || !words.every(isWord))) throw new Error('spinner.words must be short strings of printable characters')
}

function chain(name: string, user: Record<string, unknown>, seen: string[] = []): ThemeFile[] {
  if (seen.includes(name)) throw new Error(`"extends" loops: ${[...seen, name].map(shown).join(' -> ')}`)
  const raw = Object.hasOwn(user, name) ? user[name] : Object.hasOwn(PRESETS, name) ? PRESETS[name] : undefined
  if (raw === undefined) throw new Error(`no theme named "${shown(name)}"`)
  if (raw instanceof Error) throw raw
  validate(raw)
  return raw.extends ? [...chain(raw.extends, user, [...seen, name]), raw] : [raw]
}

function merge(files: ThemeFile[], name: string): Theme {
  const base = PRESETS.classic!
  const t: Theme = { name, colors: { ...base.colors } as Colors, spinnerWords: [...base.spinner!.words!], glyphs: { ...base.glyphs } as Theme['glyphs'], hearts: [...base.band!.hearts!] as [string, string] }
  for (const f of files) {
    Object.assign(t.colors, f.colors)
    Object.assign(t.glyphs, f.glyphs)
    if (f.spinner?.words?.length) t.spinnerWords = [...f.spinner.words]
    if (f.band?.hearts) t.hearts = [...f.band.hearts]
  }
  return t
}

export function resolveTheme(name: string, user: Record<string, unknown>): { theme: Theme; error?: string } {
  try { return { theme: merge(chain(name, user), name) } }
  catch (err) { return { theme: merge([PRESETS.classic!], 'classic'), error: `theme "${shown(name)}": ${(err as Error).message}` } }
}
