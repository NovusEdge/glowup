// JSX-free: installer/gen/packs.ts runs it under plain node to write the installer's packs.json.
import { resolveLook, type Border, type RowStyle, type SpinnerId } from './packs.ts'
import { PACKS } from './packpresets.ts'
import { spinnerCells, type Cell } from './motion.ts'
import type { Colors } from './themes.ts'

export type PackExport = {
  name: string
  description: string
  bg: string
  rows: RowStyle
  border: Border
  borderColor: string
  gradient: [string, string] | null
  colors: Colors
  spinner: { id: SpinnerId; word: string; color: string; frame: Cell[][] }
}

// 600 ms lands every built-in spinner on a frame that reads as itself (stock shows ✽, eyes are open).
const FRAME_MS = 600

export function packExport(): PackExport[] {
  return Object.keys(PACKS).map(name => {
    const { look } = resolveLook({ colors: name, motion: name }, {}, {})
    const c = look.theme.colors
    return {
      name,
      description: PACKS[name]!.description ?? '',
      bg: look.bg,
      rows: look.rows,
      border: look.border,
      borderColor: look.borderColor,
      gradient: look.gradient ?? null,
      colors: { ...c },
      spinner: {
        id: look.motion.spinner,
        word: look.theme.spinnerWords[0] ?? 'Thinking',
        color: look.motion.color,
        frame: spinnerCells(look.motion.spinner, FRAME_MS, { color: look.motion.color, bg: look.bg, fg: c.text }),
      },
    }
  })
}

export const packsJson = (): string => JSON.stringify(packExport(), null, 2) + '\n'
