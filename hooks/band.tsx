import type { Model } from './model.ts'
import { bandVisible } from './model.ts'
import type { Theme } from './themes.ts'
import type { Look } from './packs.ts'
import { comboSegs, fit, hearts, hpBar, renderSegs, toneColor, visibleLength, type Seg, type Tier } from './layout.tsx'

// The pet is never drawn here: it lives at the bottom of the glowup pane.
export type BandExtra = { look?: Look; friday?: boolean }

export function bandSegments(m: Model, base: Theme, columns: number, extra?: BandExtra): Seg[] {
  const t = extra?.look?.theme ?? base
  const c = t.colors
  const head: Seg[] = [{ text: `${m.act.glyph} ${m.act.label}`, color: toneColor(t, m.act.tone), bold: true }, ...comboSegs(m.combo, extra?.look)]
  const tail: Seg[] = []
  const live = m.agents.filter(a => a.state === 'running').length
  if (live) tail.push({ text: '  ·  ', color: c.dim }, { text: `◆ ${live} subagent${live === 1 ? '' : 's'}`, color: c.agent })
  // the life bar needs room for its words; a narrow band keeps the hearts
  tail.push({ text: '  ·  ', color: c.dim }, ...(extra?.look?.extras.hp && columns >= 80 ? hpBar(m.ctxPercent, t, Math.min(34, Math.floor(columns * 0.3))) : hearts(m.ctxPercent, t)))
  if (m.plan.length) {
    const done = m.plan.filter(p => p.status === 'completed').length
    tail.push({ text: '  ·  ', color: c.dim }, { text: '◇ ', color: c.dim }, { text: '●'.repeat(done) + '○'.repeat(m.plan.length - done), color: c.accent })
  }
  // the action may shrink; the tail stays whole until even it doesn't fit
  const tailLen = visibleLength(tail)
  if (tailLen + 8 > columns) return fit(head, columns)
  return [...fit(head, columns - tailLen), ...tail]
}

export function renderBand(els: { Box: any; Text: any }, m: Model, t: Theme, columns: number, tier: Tier, now: number, extra?: BandExtra) {
  if (tier === 'wide' || !bandVisible(m, now)) return null
  return renderSegs(els, bandSegments(m, t, columns, extra), 'band')
}
