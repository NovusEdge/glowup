import type { Theme } from './themes.ts'
import type { Act } from './model.ts'

export type Tier = 'wide' | 'medium' | 'compact'
export type Seg = { text: string; color: string; bold?: boolean; bg?: string }

export const tierFor = (columns: number, paneDocked: boolean): Tier => paneDocked ? 'wide' : columns >= 80 ? 'medium' : 'compact'
export const visibleLength = (segs: Seg[]) => segs.reduce((n, s) => n + [...s.text].length, 0)

export function fit(segs: Seg[], width: number): Seg[] {
  if (width <= 0) return []
  if (visibleLength(segs) <= width) return segs
  const out: Seg[] = []
  let used = 0
  for (const s of segs) {
    const chars = [...s.text]
    if (used + chars.length < width) { out.push(s); used += chars.length; continue }
    out.push({ ...s, text: chars.slice(0, Math.max(0, width - used - 1)).join('') + '…' })
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
  return <Box key={key} flexDirection="row">{segs.map(s => <Text color={s.color} bold={s.bold} backgroundColor={s.bg} wrap="truncate">{s.text}</Text>)}</Box>
}
