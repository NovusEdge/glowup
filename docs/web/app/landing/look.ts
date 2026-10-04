import { COLOR_KEYS, PACKS, PRESETS, resolveLook, type Look } from './data.ts'

export const PACK_NAMES = Object.keys(PACKS)
export const THEME_NAMES = Object.keys(PRESETS)
export const packLook = (pack: string, theme?: string): Look => resolveLook({ colors: pack, motion: pack, theme }, {}, {}).look

export function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return '#' + x!.map((v, i) => Math.round(v + (y![i]! - v) * t).toString(16).padStart(2, '0')).join('')
}

export function lookVars(look: Look): Record<string, string> {
  const c = look.theme.colors
  const v: Record<string, string> = { '--bg': look.bg }
  for (const k of COLOR_KEYS) v[`--${k}`] = c[k]
  v['--g1'] = look.gradient?.[0] ?? c.accent
  v['--g2'] = look.gradient?.[1] ?? c.read
  v['--bc'] = look.borderColor
  v['--spinc'] = look.motion.color
  return v
}
