// JSX-free: node --test runs it. Every rule the studio applies is the mod's own, through data.ts.
import {
  COLOR_KEYS, DEFAULT_FIELDS, DEFAULT_SETUP, FIELD_DEFAULTS, FIELD_KNOBS, GLYPH_KEYS, STATUS_FIELD_IDS, STUDIO_URL, checkGlyphs,
  checkHearts, checkWords, decodeLink, encodeLink, exportMix, exportName, isNewerSpinner, normalizeHex, packNameProblem,
  parseSetup, resolveLook, resolveTheme, validatePack,
  type ColorsLayer, type Field, type Look, type MotionLayer, type PackFile, type Setup, type StatusFieldId,
} from '../landing/data.ts'
import { mixHex, packLook } from '../landing/look.ts'

export type Draft = PackFile & { colors: ColorsLayer; motion: MotionLayer }
export type Role = (typeof COLOR_KEYS)[number]
export type GlyphKey = (typeof GLYPH_KEYS)[number]
export type PetPart = 'body' | 'light' | 'shade'
export type StudioSetup = Setup & { statusline: StatusFieldId[] }
export const DEFAULT_STUDIO_SETUP: StudioSetup = { ...DEFAULT_SETUP, statusline: [...DEFAULT_FIELDS] }

// Chat clients cut longer links; the pane hides its link past the same length.
export const LINK_MAX = 2048
const MAX_BYTES = 65536
// resolveLook reads built-ins before user packs, so a draft resolves under a name no pack can have.
const KEY = 'studio:draft'

const resolveDraft = (file: PackFile) => {
  const r = resolveLook({ colors: KEY, motion: KEY }, { [KEY]: { ...file, name: KEY } }, {})
  return { look: r.look, errors: r.errors.filter(e => !isNewerSpinner(e)).map(e => e.replaceAll(KEY, file.name)) }
}

export const startDraft = (pack: string): Draft => exportMix(packLook(pack), exportName(pack)) as Draft
export const draftLook = (d: Draft) => resolveDraft(d)
export const packJson = (d: Draft) => JSON.stringify(d, null, 2) + '\n'

export function draftProblems(d: Draft): string[] {
  const out: string[] = []
  const name = packNameProblem(d.name)
  if (name) out.push(name)
  else {
    try { validatePack(d) } catch (err) { out.push((err as Error).message) }
  }
  if (packJson(d).length > MAX_BYTES) out.push('The pack is over 64 KB.')
  return [...out, ...draftLook(d).errors]
}

export const editColors = (d: Draft, patch: Partial<ColorsLayer>): Draft => ({ ...d, colors: { ...(d.colors as ColorsLayer), ...patch } })
export const editMotion = (d: Draft, patch: Partial<MotionLayer>): Draft => ({ ...d, motion: { ...(d.motion as MotionLayer), ...patch } })

export function setRole(d: Draft, role: Role, text: string): Draft | undefined {
  const hex = normalizeHex(text.trim())
  return hex ? editColors(d, { palette: { ...d.colors.palette, [role]: hex } }) : undefined
}

// Drops the base theme's own glyphs, hearts and words with it, so the new theme's apply.
export function setBaseTheme(d: Draft, theme: string): Draft {
  const { glyphs: _g, hearts: _h, words: _w, bg: _b, borderColor: _c, gradient: _r, ...rest } = d.colors as ColorsLayer
  return { ...d, colors: { ...rest, theme, palette: { ...resolveTheme(theme, {}).theme.colors } } }
}

export function setSurface(d: Draft, key: 'bg' | 'borderColor', text: string): Draft | undefined {
  const hex = normalizeHex(text.trim())
  return hex ? editColors(d, { [key]: hex }) : undefined
}

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v))

export function setField(d: Draft, patch: Partial<Field>): Draft {
  const cur = d.motion.field
  const base = typeof cur === 'object' ? cur : { shape: cur ?? 'none', ...FIELD_DEFAULTS }
  const next: Record<string, unknown> = { ...base, ...patch }
  for (const [k, range] of Object.entries(FIELD_KNOBS)) {
    const v = next[k]
    if (typeof v === 'number' && !Number.isFinite(v)) next[k] = (base as Record<string, unknown>)[k]
    else if (typeof v === 'number') next[k] = k === 'size' ? Math.round(clamp(v, range)) : clamp(v, range)
  }
  return editMotion(d, { field: next as MotionLayer['field'] })
}

const petLight = (body: string) => mixHex(body, '#ffffff', 0.3)
const petShade = (body: string) => mixHex(body, '#000000', 0.25)

// Light and shade follow the body until one is typed by hand: a value that is not the one derived from the
// current body counts as hand-set, so the link survives a reload without extra state.
export function setPetColor(d: Draft, part: PetPart, text: string): Draft | undefined {
  const hex = normalizeHex(text.trim())
  if (!hex) return undefined
  const pet = d.colors.pet ?? {}
  const next = { ...pet, [part]: hex }
  if (part === 'body') {
    const followed = (have: string | undefined, derive: (b: string) => string) => have === undefined || (pet.body !== undefined && have === derive(pet.body))
    if (followed(pet.light, petLight)) next.light = petLight(hex)
    if (followed(pet.shade, petShade)) next.shade = petShade(hex)
  }
  return editColors(d, { pet: next })
}

export function resetPet(d: Draft): Draft {
  const { pet: _p, ...rest } = d.colors as ColorsLayer
  return { ...d, colors: rest }
}

export function setGlyph(d: Draft, key: GlyphKey, text: string): Draft | undefined {
  try { checkGlyphs({ [key]: text }, 'colors.glyphs') } catch { return undefined }
  return editColors(d, { glyphs: { ...d.colors.glyphs, [key]: text } })
}

export function setHearts(d: Draft, full: string, empty: string): Draft | undefined {
  try { checkHearts([full, empty], 'colors.hearts') } catch { return undefined }
  return editColors(d, { hearts: [full, empty] })
}

export function setWords(d: Draft, text: string): Draft | undefined {
  const words = text.split(',').map(w => w.trim()).filter(Boolean)
  if (!words.length) return undefined
  try { checkWords(words, 'colors.words') } catch { return undefined }
  return editColors(d, { words })
}

// bg and borderColor live beside the palette in the pack, not in it.
export type SwatchRole = Role | 'bg' | 'borderColor'
type Swatch = { label: string; role: SwatchRole } | { label: string; pet: PetPart }
export const COLOR_GROUPS: { name: string; items: Swatch[] }[] = [
  { name: 'Text', items: [{ label: 'Text', role: 'text' }, { label: 'Secondary', role: 'dim' }, { label: 'Lines & empty bars', role: 'faint' }, { label: 'Accent', role: 'accent' }] },
  { name: 'Tool rows', items: [{ label: 'Read & search', role: 'read' }, { label: 'Edits', role: 'edit' }, { label: 'Shell', role: 'shell' }, { label: 'Subagents', role: 'agent' }] },
  { name: 'Results', items: [{ label: 'Success', role: 'pass' }, { label: 'Failure', role: 'fail' }] },
  { name: 'Surfaces', items: [{ label: 'Background', role: 'bg' }, { label: 'Pane', role: 'panel' }, { label: 'Border', role: 'borderColor' }] },
  { name: 'Clawd', items: [{ label: 'Body', pet: 'body' }, { label: 'Light', pet: 'light' }, { label: 'Shade', pet: 'shade' }] },
]

const hashOf = (link: string) => link.slice(STUDIO_URL.length)
export const shareLink = (d: Draft) => encodeLink({ pack: d })
export const sendCommand = (d: Draft, s: StudioSetup) => `/glowup pack ${encodeLink({ pack: d, setup: s })}`
export const stateHash = (d: Draft, s: StudioSetup) => hashOf(encodeLink({ pack: d, setup: s }))

function parseStatusline(raw: unknown): { ids: StatusFieldId[]; notices: string[] } {
  if (raw === undefined) return { ids: [...DEFAULT_FIELDS], notices: [] }
  const list = Array.isArray(raw) ? raw : []
  const known = (s: unknown): s is StatusFieldId => (STATUS_FIELD_IDS as readonly unknown[]).includes(s)
  const ids = [...new Set(list.filter(known))]
  const notices = list.filter(s => !known(s)).map(s => `unknown status line field "${String(s)}"`)
  if (!Array.isArray(raw)) notices.push('statusline must be a list of field ids')
  return ids.length ? { ids, notices } : { ids: [...DEFAULT_FIELDS], notices }
}

// A pack is flattened through resolveLook, so a link pack that extends a built-in opens with every value
// visible. exportMix rewrites the description from the resolve key, so the link's own is kept instead.
export function fromHash(hash: string): { draft?: Draft; setup?: StudioSetup; notices: string[] } {
  if (hash === '' || hash === '#') return { notices: [] }
  const { parts, errors } = decodeLink(STUDIO_URL + (hash.startsWith('#') ? hash : `#${hash}`))
  const notices = [...errors]
  const out: { draft?: Draft; setup?: StudioSetup; notices: string[] } = { notices }
  if (parts.pack !== undefined) {
    try {
      validatePack(parts.pack)
      const file = parts.pack
      const r = resolveDraft(file)
      if (r.errors.length) notices.push(`pack part: ${r.errors[0]}`)
      else {
        const flat = exportMix(r.look, exportName(file.name.toLowerCase())) as Draft
        delete flat.description
        out.draft = file.description === undefined ? flat : { ...flat, description: file.description }
      }
    } catch (err) {
      notices.push(`pack part: ${(err as Error).message}`)
    }
  }
  if (parts.setup !== undefined) {
    const r = parseSetup(parts.setup)
    const sl = parseStatusline((parts.setup as { statusline?: unknown } | null)?.statusline)
    out.setup = { ...r.setup, statusline: sl.ids }
    notices.push(...[...r.notices, ...sl.notices].map(n => `setup: ${n}`))
  }
  if (parts.pet !== undefined) notices.push('This link carries a pet; the studio cannot edit pets yet.')
  return out
}

const channel = (hex: string, i: number) => {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

// Hovering a role fades the others toward the background, so what it paints stands out in place.
export function focusVars(look: Look, role: Role): Record<string, string> {
  const v: Record<string, string> = {}
  for (const k of COLOR_KEYS) if (k !== role) v[`--${k}`] = mixHex(look.theme.colors[k], look.bg, 0.75)
  return v
}

export function editSetup(s: StudioSetup, patch: Partial<StudioSetup>): { setup: StudioSetup; notice?: string } {
  const { statusline = s.statusline, ...rest } = patch
  if (!statusline.length) return { setup: s, notice: 'status line needs at least one field' }
  const { statusline: _, ...own } = s
  const r = parseSetup({ ...own, ...rest })
  return r.notices.length ? { setup: s, notice: r.notices[0] } : { setup: { ...r.setup, statusline } }
}

export function move<T>(list: readonly T[], i: number, by: -1 | 1): T[] {
  const out = [...list], j = i + by
  if (j < 0 || j >= out.length) return out
  ;[out[i], out[j]] = [out[j]!, out[i]!]
  return out
}

export const toggle = <T>(list: readonly T[], item: T): T[] => (list.includes(item) ? list.filter(x => x !== item) : [...list, item])
