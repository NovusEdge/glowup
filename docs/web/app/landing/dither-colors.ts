import type { Look } from './data.ts'
import { mixHex } from './look.ts'

// Muted tones, not the raw accent: the dots read as texture behind text, not as a glow.
export const ditherColors = (l: Look): [string, string, string] => [l.bg, mixHex(l.bg, l.theme.colors.faint, 0.9), mixHex(l.bg, l.theme.colors.accent, 0.55)]
