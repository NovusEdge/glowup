// JSX-free: installer/gen/packs.ts runs it under plain node to write the installer's packs.json.
import { resolveLook, SPINNER_IDS, type Border, type RowStyle, type SpinnerId } from './packs.ts'
import { PACKS } from './packpresets.ts'
import { PRESETS, resolveTheme, type Colors } from './themes.ts'
import { SPINNERS, spinnerCells, type Cell } from './motion.ts'
import { CLAWD_SHEET, animFor, composeFrame, halfBlock, type PetSpan } from './pets.ts'

export type PackExport = {
  name: string
  description: string
  bg: string
  rows: RowStyle
  border: Border
  borderColor: string
  gradient: [string, string] | null
  colors: Colors
  // color is null when the pack leaves the spinner on the theme's accent, so a theme pick recolors it
  spinner: { id: SpinnerId; word: string; color: string | null }
}

export type ThemeExport = { name: string; word: string; colors: Colors }

// Frames are drawn in white on black: a gray cell is a brightness level the installer remaps onto the
// spinner color and background it previews with. A cell that is not gray (Clawd's own orange) keeps its color.
// text is true when the spinner draws in the theme's text color instead of the spinner color (the eyes).
export type SpinnerExport = { id: SpinnerId; name: string; ms: number; text: boolean; frames: Cell[][][] }

export type ClawdExport = { cols: number; rows: PetSpan[][] }

export type Export = { packs: PackExport[]; themes: ThemeExport[]; spinners: SpinnerExport[]; clawd: ClawdExport }

const FRAME_MS: Record<string, number> = { stock: 120, clawd: 220 }
const FRAMES: Record<string, number> = { stock: 6, clawd: 4 }
const MONO = { color: '#ffffff', bg: '#000000', fg: '#ffffff' }

export function packExport(): PackExport[] {
  return Object.keys(PACKS).map(name => {
    const { look } = resolveLook({ colors: name, motion: name }, {}, {})
    const c = look.theme.colors
    // The same motion under two palettes with different accents: the color matches only if the pack sets it.
    const a = resolveLook({ colors: 'classic', motion: name }, {}, {}).look.motion.color
    const b = resolveLook({ colors: 'arcade', motion: name }, {}, {}).look.motion.color
    return {
      name,
      description: PACKS[name]!.description ?? '',
      bg: look.bg,
      rows: look.rows,
      border: look.border,
      borderColor: look.borderColor,
      gradient: look.gradient ?? null,
      colors: { ...c },
      spinner: { id: look.motion.spinner, word: look.theme.spinnerWords[0] ?? 'Thinking', color: a === b ? a : null },
    }
  })
}

export const themeExport = (): ThemeExport[] => Object.keys(PRESETS).map(name => {
  const t = resolveTheme(name, {}).theme
  return { name, word: t.spinnerWords[0] ?? 'Thinking', colors: { ...t.colors } }
})

export const spinnerExport = (): SpinnerExport[] => SPINNER_IDS.map(id => {
  const ms = FRAME_MS[id] ?? 150
  const s = SPINNERS[id]
  return { id, name: s.name, ms, text: 'useFg' in s && s.useFg === true, frames: Array.from({ length: FRAMES[id] ?? 12 }, (_, i) => spinnerCells(id, i * ms, MONO)) }
})

// The idle pose's first frame, as the band draws it: no outfit, not mirrored.
export const clawdExport = (): ClawdExport => ({
  cols: CLAWD_SHEET.w,
  rows: halfBlock(composeFrame(CLAWD_SHEET, animFor(CLAWD_SHEET, 'idle').frames[0]!, [], false), CLAWD_SHEET.palette),
})

export const exportAll = (): Export => ({ packs: packExport(), themes: themeExport(), spinners: spinnerExport(), clawd: clawdExport() })

export const packsJson = (): string => JSON.stringify(exportAll(), null, 2) + '\n'
