import { SPINNER_IDS, type Look, type Mix } from './packs.ts'
import { SPINNERS, spinnerCells, cellsToSpans } from './motion.ts'
import { gradient, wave } from './color.ts'
import type { PetSetting } from './pets.ts'
import type { BubbleSetting } from './bubbles.ts'
import { fit, renderSegs, type Seg } from './layout.tsx'

export type Draft = { mix: Mix; pet: PetSetting; bubbles: BubbleSetting; reduced: boolean; saveAs: string }
export type ConfigActions = { change(d: Draft): void; apply(): void; cancel(): void; save(name: string): void }
export type Choices = { packs: string[]; pets: PetSetting[] }

const SWATCH = ['accent', 'text', 'dim', 'read', 'edit', 'shell', 'agent', 'pass', 'fail'] as const

export function previewRows(look: Look, width: number, now: number, reduced: boolean): Seg[][] {
  const c = look.theme.colors, t = reduced ? 0 : now
  const rows: Seg[][] = []
  rows.push(SWATCH.map(k => ({ text: '██', color: c[k] })))
  rows.push(look.gradient ? gradient('█'.repeat(Math.min(width, 24)), look.gradient[0], look.gradient[1])
    : [{ text: '████ ', color: c.accent }, { text: '████ ', color: c.read }, { text: '████', color: c.edit }])

  const cells = cellsToSpans(spinnerCells(reduced ? 'stock' : look.motion.spinner, t, { color: look.motion.color, bg: look.bg, fg: c.text }))
  const word = (look.theme.spinnerWords[0] ?? 'Thinking') + '…'
  const shimmer = reduced || look.motion.shimmer === 0 ? [{ text: word, color: c.text }] : wave(word, c.dim, look.motion.color, t, look.motion.shimmer)
  cells.forEach((r, i) => rows.push(i === 0 ? [...r, { text: ' ', color: c.text }, ...shimmer] : r))

  const txt = (text: string): Seg => ({ text, color: c.text })
  const bar: Seg = { text: '▎ ', color: look.borderColor }
  const tool = 'Edit src/auth.ts'
  switch (look.rows) {
    case 'classic':
      rows.push([{ text: '› ', color: c.accent, bold: true }, txt('fix the failing test')])
      rows.push([{ text: look.theme.glyphs.edit + ' ', color: c.edit }, txt(tool), { text: '  +2 −1', color: c.pass }])
      rows.push([{ text: '● ', color: c.pass }, txt('Patched the redirect check.')])
      break
    case 'minimal':
      rows.push([{ text: '› ', color: c.accent, bold: true }, txt('fix the failing test')])
      rows.push([txt(tool + ' '), { text: '✓', color: c.pass }])
      rows.push([txt('Patched the redirect check.')])
      break
    case 'cards':
      rows.push([bar, { text: 'you', color: c.accent, bold: true }], [bar, txt('fix the failing test')])
      rows.push([bar, txt(tool + ' '), { text: '✓', color: c.pass }])
      rows.push([bar, { text: 'claude', color: c.accent, bold: true }], [bar, txt('Patched the redirect check.')])
      break
    case 'retro':
      rows.push([{ text: '[YOU] ', color: c.accent, bold: true }, txt('fix the failing test')])
      rows.push([{ text: '[EDIT  ] ', color: c.accent }, txt(tool + ' '), { text: '[ OK ]', color: c.pass }])
      rows.push([{ text: '[CLAUDE] ', color: c.accent, bold: true }, txt('Patched the redirect check.')])
      break
  }
  return rows.map(r => fit(r, width))
}

const opts = (values: readonly string[]) => values.map(value => ({ value }))
const COMMANDS = ['/glowup pack <name>', '/glowup pet clawd|off', '/glowup bubbles on|off', '/glowup motion reduced|full']

export function renderConfig(
  els: { Box: any; Text: any; Button: any; Select?: any; Input?: any },
  d: Draft, preview: Look, choices: Choices, width: number, now: number, act: ConfigActions,
) {
  const { Box, Text, Button, Select, Input } = els
  const { mix } = d
  const known = (n: string) => choices.packs.includes(n)
  const pack = mix.colors === mix.motion && !mix.theme && !mix.spinner && known(mix.colors) ? mix.colors : ''
  const layer = (n: string) => known(n) ? choices.packs : [...choices.packs, n]
  const withMix = (m: Partial<Mix>) => act.change({ ...d, mix: { ...mix, ...m } })
  const previewBox = <Box flexDirection="column" key="preview">{previewRows(preview, width, now, d.reduced).map((r, i) => renderSegs(els, r, 'p' + i))}</Box>
  const buttons = (
    <Box flexDirection="row" key="buttons">
      <Button key="apply" label="Apply" variant="primary" onPress={() => act.apply()} />
      <Button key="cancel" label="Cancel" role="dismiss" onPress={() => act.cancel()} />
    </Box>
  )

  if (!Select || !Input) {
    return (
      <Box flexDirection="column">
        <Text bold wrap="truncate">glowup config</Text>
        <Text wrap="truncate">{`colors ${mix.colors} · motion ${mix.motion}${mix.spinner ? ' · spinner ' + mix.spinner : ''} · pet ${d.pet} · bubbles ${d.bubbles} · ${d.reduced ? 'reduced' : 'full'} motion`}</Text>
        {previewBox}
        {COMMANDS.map(s => <Box key={s}><Text dimColor wrap="truncate">{s}</Text></Box>)}
        {buttons}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text bold wrap="truncate">glowup config</Text>
      <Select key="pack" label="pack" value={pack} options={pack ? opts(choices.packs) : [{ value: '', label: 'custom mix' }, ...opts(choices.packs)]} onSelect={(v: string) => act.change({ ...d, mix: { colors: v, motion: v } })} />
      <Select key="colors" label="colors" value={mix.colors} options={opts(layer(mix.colors))} onSelect={(v: string) => withMix({ colors: v })} />
      <Select key="motion" label="motion" value={mix.motion} options={opts(layer(mix.motion))} onSelect={(v: string) => withMix({ motion: v })} />
      <Select key="spinner" label="spinner" value={mix.spinner ?? ''} options={[{ value: '', label: 'pack default' }, ...SPINNER_IDS.map(value => ({ value, label: SPINNERS[value].name }))]}
        onSelect={(v: string) => { const { spinner: _, ...rest } = mix; act.change({ ...d, mix: v ? { ...rest, spinner: v } : rest }) }} />
      <Select key="pet" label="pet" value={d.pet} options={opts(choices.pets)} onSelect={(v: string) => act.change({ ...d, pet: v as PetSetting })} />
      <Select key="bubbles" label="bubbles" value={d.bubbles} options={opts(['on', 'off'])} onSelect={(v: string) => act.change({ ...d, bubbles: v as BubbleSetting })} />
      <Button key="reduced" label={`reduced motion: ${d.reduced ? 'on' : 'off'}`} onPress={() => act.change({ ...d, reduced: !d.reduced })} />
      {previewBox}
      <Input key="save-as" placeholder="save as pack…" value={d.saveAs} onInput={(v: string) => act.change({ ...d, saveAs: v })} onSubmit={(v: string) => { if (v.trim()) act.save(v.trim()) }} />
      {buttons}
    </Box>
  )
}
