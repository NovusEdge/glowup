// JSX-free: the docs site imports it.
import { resolveTheme, PRESETS, COLOR_KEYS, shown, isPlain, isUnsafe, type Colors, type Theme } from './themes.ts'
import { PACKS } from './packpresets.ts'

export const SPINNER_IDS = ['stock', 'comet', 'eyes', 'orb-states', 'clawd', 'shimmer'] as const
export type SpinnerId = (typeof SPINNER_IDS)[number]
export const ROW_STYLES = ['classic', 'cards', 'minimal', 'retro'] as const
export type RowStyle = (typeof ROW_STYLES)[number]
export const BORDERS = ['round', 'single', 'double', 'bold', 'classic'] as const
export type Border = (typeof BORDERS)[number]
export type ColorsLayer = { theme?: string; palette?: Partial<Colors>; bg?: string; rows?: RowStyle; border?: Border; borderColor?: string; gradient?: [string, string]; extras?: { hp?: boolean; combo?: boolean } }
// spinner is any well-formed id: a pack made for a later glowup may name one this build lacks
export type MotionLayer = { spinner?: string; shimmer?: 0 | 1 | 2; color?: string }
export type PackFile = { format: 1; name: string; extends?: string; description?: string; colors?: ColorsLayer | string; motion?: MotionLayer | string }
export type Mix = { colors: string; motion: string; theme?: string; spinner?: string }
export type Look = {
  colorsFrom: string; motionFrom: string; theme: Theme; bg: string; rows: RowStyle; border: Border; borderColor: string
  gradient?: [string, string]; extras: { hp: boolean; combo: boolean }; motion: { spinner: SpinnerId; shimmer: 0 | 1 | 2; color: string }
}
export const DEFAULT_MIX: Mix = { colors: 'classic', motion: 'classic' }
export const MAX_DEPTH = 8
const FORMAT = 1
// sound and voice are reserved for later versions: accepted, never read
export const PACK_KEYS = ['format', 'name', 'extends', 'description', 'colors', 'motion', 'sound', 'voice']
export const COLORS_KEYS = ['theme', 'palette', 'bg', 'rows', 'border', 'borderColor', 'gradient', 'extras']
export const MOTION_KEYS = ['spinner', 'shimmer', 'color']
export const EXTRAS_KEYS = ['hp', 'combo']
export const isNewerSpinner = (e: string) => /^spinner ".*" needs a newer glowup/.test(e)
const HEX = /^#[0-9a-fA-F]{6}$/
const SPINNER_SHAPE = /^[a-z][a-z0-9-]{0,23}$/

type Layer = Record<string, unknown>

const safeText = (v: unknown, max = 40): v is string => typeof v === 'string' && v.length <= max && [...v].every(c => !isUnsafe(c.codePointAt(0)!))
const oneOf = (list: readonly unknown[], v: unknown) => list.includes(v)

function checkTop(file: unknown): asserts file is Record<string, unknown> {
  if (!isPlain(file)) throw new Error('a pack must be a JSON object')
  for (const k of Object.keys(file)) if (!PACK_KEYS.includes(k)) throw new Error(`unknown key "${shown(k)}"`)
  const fmt = file.format
  if (fmt === undefined || (typeof fmt === 'number' && fmt < 1)) throw new Error('"format": 1 is missing')
  if (typeof fmt !== 'number' || !Number.isInteger(fmt)) throw new Error('"format" must be a whole number')
  if (fmt > FORMAT) throw new Error(`made for a newer glowup (format ${fmt})`)
  if (!safeText(file.name) || file.name === '') throw new Error('"name" must be short printable text')
  if (file.extends !== undefined && !safeText(file.extends)) throw new Error('"extends" must be a pack name')
  if (file.description !== undefined && !safeText(file.description, 80)) throw new Error('"description" must be printable text of at most 80 characters')
}

function checkColors(v: unknown): void {
  if (v === undefined) return
  if (typeof v === 'string') { if (!safeText(v)) throw new Error('"colors" must be a pack name or an object'); return }
  if (!isPlain(v)) throw new Error('"colors" must be a pack name or an object')
  for (const k of Object.keys(v)) if (!COLORS_KEYS.includes(k)) throw new Error(`unknown key "${shown(k)}" in colors`)
  if (v.theme !== undefined && !safeText(v.theme)) throw new Error('colors.theme must be a theme name')
  if (v.palette !== undefined) {
    if (!isPlain(v.palette)) throw new Error('colors.palette must be an object')
    for (const [k, c] of Object.entries(v.palette)) {
      if (!(COLOR_KEYS as readonly string[]).includes(k)) throw new Error(`unknown color "${shown(k)}"`)
      if (typeof c !== 'string' || !HEX.test(c)) throw new Error(`color "${k}" must be #rrggbb`)
    }
  }
  for (const k of ['bg', 'borderColor']) if (v[k] !== undefined && (typeof v[k] !== 'string' || !HEX.test(v[k]))) throw new Error(`colors.${k} must be #rrggbb`)
  if (v.rows !== undefined && !oneOf(ROW_STYLES, v.rows)) throw new Error(`colors.rows must be one of ${ROW_STYLES.join(', ')}`)
  if (v.border !== undefined && !oneOf(BORDERS, v.border)) throw new Error(`colors.border must be one of ${BORDERS.join(', ')}`)
  const g = v.gradient
  if (g !== undefined && (!Array.isArray(g) || g.length !== 2 || !g.every(c => typeof c === 'string' && HEX.test(c)))) throw new Error('colors.gradient must be two #rrggbb colors')
  if (v.extras !== undefined) {
    if (!isPlain(v.extras)) throw new Error('colors.extras must be an object of hp and combo booleans')
    for (const [k, b] of Object.entries(v.extras)) if (!EXTRAS_KEYS.includes(k) || typeof b !== 'boolean') throw new Error('colors.extras takes only hp and combo, as true or false')
  }
}

function checkMotion(v: unknown): void {
  if (v === undefined) return
  if (typeof v === 'string') { if (!safeText(v)) throw new Error('"motion" must be a pack name or an object'); return }
  if (!isPlain(v)) throw new Error('"motion" must be a pack name or an object')
  for (const k of Object.keys(v)) if (!MOTION_KEYS.includes(k)) throw new Error(`unknown key "${shown(k)}" in motion`)
  if (v.spinner !== undefined && !(typeof v.spinner === 'string' && SPINNER_SHAPE.test(v.spinner))) throw new Error('motion.spinner must be a lowercase id such as "comet"')
  if (v.shimmer !== undefined && !oneOf([0, 1, 2], v.shimmer)) throw new Error('motion.shimmer must be 0, 1 or 2')
  if (v.color !== undefined && (typeof v.color !== 'string' || !HEX.test(v.color))) throw new Error('motion.color must be #rrggbb')
}

export function validatePack(file: unknown): asserts file is PackFile {
  checkTop(file)
  checkColors(file.colors)
  checkMotion(file.motion)
}

const merge = (a: Layer, b: Layer): Layer => {
  const out: Layer = { ...a, ...b }
  for (const k of ['palette', 'extras']) if (a[k] || b[k]) out[k] = { ...(a[k] as object), ...(b[k] as object) }
  return out
}

// Layers are validated one at a time so a bad colors layer leaves the motion layer usable.
function collect(name: string, kind: 'colors' | 'motion', user: Record<string, unknown>, seen: string[]): Layer {
  if (seen.includes(name)) throw new Error(`"extends" loops: ${[...seen, name].map(shown).join(' -> ')}`)
  if (seen.length >= MAX_DEPTH) throw new Error(`chain is deeper than ${MAX_DEPTH}: ${[...seen, name].map(shown).join(' -> ')}`)
  // Built-ins first: a stray user classic.json must not change crt, cozy or arcade.
  const raw = Object.hasOwn(PACKS, name) ? PACKS[name] : Object.hasOwn(user, name) ? user[name] : undefined
  if (raw === undefined) throw new Error(`no pack named "${shown(name)}"`)
  if (raw instanceof Error) throw raw
  checkTop(raw)
  const own = raw[kind]
  ;(kind === 'colors' ? checkColors : checkMotion)(own)
  const next = [...seen, name]
  let acc: Layer = typeof raw.extends === 'string' ? collect(raw.extends, kind, user, next) : {}
  if (typeof own === 'string') acc = merge(acc, collect(own, kind, user, next))
  else if (own) acc = merge(acc, own as Layer)
  return acc
}

type ColorsOut = Pick<Look, 'theme' | 'bg' | 'rows' | 'border' | 'borderColor' | 'gradient' | 'extras'>

function colorsOf(layer: ColorsLayer, override: string | undefined, userThemes: Record<string, unknown>): ColorsOut {
  const { theme: base, error } = resolveTheme(override ?? layer.theme ?? 'classic', userThemes)
  if (error) throw new Error(error)
  const colors = override ? base.colors : { ...base.colors, ...layer.palette }
  return {
    theme: { ...base, colors },
    bg: (!override && layer.bg) || colors.panel,
    borderColor: (!override && layer.borderColor) || colors.faint,
    rows: layer.rows ?? 'classic',
    border: layer.border ?? 'round',
    gradient: layer.gradient ? (override ? [colors.accent, colors.read] : layer.gradient) : undefined,
    extras: { hp: layer.extras?.hp ?? false, combo: layer.extras?.combo ?? false },
  }
}

export function resolveLook(mix: Mix, userPacks: Record<string, unknown>, userThemes: Record<string, unknown>): { look: Look; errors: string[] } {
  const errors: string[] = []
  const reason = (name: string, kind: string, err: unknown) => `pack "${shown(name)}" ${kind}: ${err instanceof Error ? err.message : String(err)}`

  let colorsFrom = mix.colors
  let c: ColorsOut
  try {
    const layer = collect(mix.colors, 'colors', userPacks, []) as ColorsLayer
    try { c = colorsOf(layer, mix.theme, userThemes) } catch (err) {
      if (mix.theme === undefined) throw err
      errors.push((err as Error).message)
      c = colorsOf(layer, undefined, userThemes)
    }
  } catch (err) {
    errors.push(reason(mix.colors, 'colors', err))
    colorsFrom = 'classic'
    c = colorsOf(collect('classic', 'colors', {}, []) as ColorsLayer, undefined, {})
  }

  let motionFrom = mix.motion
  let m: MotionLayer
  try { m = collect(mix.motion, 'motion', userPacks, []) as MotionLayer } catch (err) {
    errors.push(reason(mix.motion, 'motion', err))
    motionFrom = 'classic'
    m = collect('classic', 'motion', {}, []) as MotionLayer
  }
  const want = mix.spinner ?? m.spinner ?? 'stock'
  let spinner: SpinnerId = 'stock'
  if (oneOf(SPINNER_IDS, want)) spinner = want as SpinnerId
  else errors.push(`spinner "${shown(want)}" needs a newer glowup; using stock`)

  return { look: { colorsFrom, motionFrom, ...c, motion: { spinner, shimmer: m.shimmer ?? 1, color: m.color ?? c.theme.colors.accent } }, errors }
}

// A mix based on a user theme exports only built-in theme names: that theme's glyphs and spinner words are not carried.
export function exportMix(look: Look, name: string): PackFile {
  const colors: ColorsLayer = {
    palette: { ...look.theme.colors }, bg: look.bg, rows: look.rows, border: look.border, borderColor: look.borderColor, extras: { ...look.extras },
  }
  if (Object.hasOwn(PRESETS, look.theme.name)) colors.theme = look.theme.name
  if (look.gradient) colors.gradient = [...look.gradient]
  // validatePack counts UTF-16 units, so cut there and drop a split surrogate pair.
  const description = `${shown(look.colorsFrom)} colors, ${shown(look.motionFrom)} motion`.slice(0, 80).replace(/[\ud800-\udbff]$/, '')
  return { format: 1, name, description, colors, motion: { ...look.motion } }
}

export const stockMotion = (look: Look): Look => ({ ...look, motion: { ...look.motion, spinner: 'stock', shimmer: 0 } })
