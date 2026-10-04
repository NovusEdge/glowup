import type { Theme } from './themes.ts'
import type { Act } from './model.ts'

export type Tier = 'wide' | 'medium' | 'compact'
export type Seg = { text: string; color: string; bold?: boolean; bg?: string }

export const tierFor = (columns: number, paneDocked: boolean): Tier => paneDocked ? 'wide' : columns >= 80 ? 'medium' : 'compact'
// Terminal cells of one code point; no wcwidth package is available to hooks.
export function cellWidth(cp: number): 0 | 1 | 2 {
  if ((cp >= 0x300 && cp <= 0x36f) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd)) return 2
  return 1
}
const cells = (text: string) => [...text].reduce((n, c) => n + cellWidth(c.codePointAt(0)!), 0)
export const visibleLength = (segs: Seg[]) => segs.reduce((n, s) => n + cells(s.text), 0)

export function fit(segs: Seg[], width: number): Seg[] {
  if (width <= 0) return []
  if (visibleLength(segs) <= width) return segs
  const out: Seg[] = []
  let used = 0
  for (const s of segs) {
    const w = cells(s.text)
    if (used + w < width) { out.push(s); used += w; continue }
    // one cell is kept for the ellipsis; a 2-cell character that would cross the line is dropped
    let kept = '', room = width - used - 1
    for (const c of s.text) {
      const cw = cellWidth(c.codePointAt(0)!)
      if (cw > room) break
      kept += c; room -= cw
    }
    out.push({ ...s, text: kept + '…' })
    break
  }
  return out
}

export function hearts(used: number, t: Theme): Seg[] {
  const full = Math.max(0, Math.min(5, Math.ceil((100 - used) / 20)))
  return [{ text: t.hearts[0].repeat(full), color: t.colors.fail }, { text: t.hearts[1].repeat(5 - full), color: t.colors.dim }].filter(s => s.text)
}

export function bar(fraction: number, width: number, color: string, t: Theme): Seg[] {
  const n = Math.max(0, Math.min(width, Math.round(fraction * width)))
  return [{ text: '█'.repeat(n), color }, { text: '░'.repeat(width - n), color: t.colors.faint }].filter(s => s.text)
}

export const ctxColor = (p: number, t: Theme) => p >= 80 ? t.colors.fail : p >= 60 ? t.colors.edit : t.colors.read

// Act tones are a subset of the theme's color keys, so this is the one place they meet.
export const toneColor = (t: Theme, tone: Act['tone']): string => t.colors[tone]

// One row of colored text. `els` is the table from $.ui.resolve(e).
// Text takes no `key` (not in TextProps); only the Box is keyed.
export function renderSegs(els: { Box: any; Text: any }, segs: Seg[], key?: string) {
  const { Box, Text } = els
  // a childless row has zero height; an empty row is a spacer and must keep its line
  if (!segs.length) return <Box key={key} height={1} />
  return <Box key={key} flexDirection="row">{segs.map(s => <Text color={s.color} bold={s.bold} backgroundColor={s.bg} wrap="truncate">{s.text}</Text>)}</Box>
}
