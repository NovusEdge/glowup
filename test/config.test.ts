import { test, expect } from 'claude-code/testing'
import { renderConfig, previewRows, type Draft } from '../hooks/config.tsx'
import { resolveLook } from '../hooks/packs.ts'
import { visibleLength } from '../hooks/layout.tsx'

const els = { Box: 'Box', Text: 'Text', Button: 'Button', Select: 'Select', Input: 'Input' }
const walk = (n: any, out: any[] = []): any[] => { if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
// The engine keeps only onPress on the node; Select and Input handlers hide behind one onEvent(e).
const KIND: Record<string, string | undefined> = { onSelect: undefined, onInput: 'change', onSubmit: 'submit' }
const call = (n: any, name: string, ...args: unknown[]) =>
  name in KIND ? n.onEvent({ kind: KIND[name], value: args[0] }) : (n[name] ?? n.props[name])(...args)
const D: Draft = { mix: { colors: 'arcade', motion: 'arcade' }, pet: 'clawd', bubbles: 'on', reduced: false, saveAs: '' }
const look = resolveLook(D.mix, {}, {}).look
const choices = { packs: ['classic', 'crt', 'cozy', 'arcade', 'mine'], pets: ['clawd', 'off'] as const }

const draw = (d: Draft = D) => {
  const log: unknown[] = []
  const act = { change: (x: Draft) => log.push(x), apply: () => log.push('apply'), cancel: () => log.push('cancel'), save: (n: string) => log.push('save:' + n) }
  return { log, tree: walk(renderConfig(els, d, look, { ...choices, pets: [...choices.pets] }, 60, 0, act)) }
}

test('selects for pack, layers, spinner, pet and bubbles, with current values', async () => {
  const { tree } = draw()
  const sel = Object.fromEntries(tree.filter(n => n.type === 'Select').map(n => [n.props.key, n.props.value]))
  expect(sel).toEqual({ pack: 'arcade', colors: 'arcade', motion: 'arcade', spinner: '', pet: 'clawd', bubbles: 'on' })
  expect(tree.find(n => n.props?.key === 'spinner').props.options.map((o: { value: string }) => o.value)).toEqual(['', 'stock', 'comet', 'eyes', 'orb-states', 'clawd', 'shimmer'])
})

test('picking a pack sets both layers and clears theme and spinner', async () => {
  const { tree, log } = draw({ ...D, mix: { colors: 'arcade', motion: 'arcade', theme: 'x', spinner: 'comet' } })
  call(tree.find(n => n.props?.key === 'pack'), 'onSelect', 'crt', {})
  expect((log[0] as Draft).mix).toEqual({ colors: 'crt', motion: 'crt' })
})

test('a mix with an override shows the custom option; spinner "" removes the override', async () => {
  const d: Draft = { ...D, mix: { colors: 'arcade', motion: 'arcade', spinner: 'comet' } }
  const { tree, log } = draw(d)
  const pack = tree.find(n => n.props?.key === 'pack')
  expect(pack.props.value).toBe('')
  expect(pack.props.options.some((o: { value: string }) => o.value === '')).toBe(true)
  call(tree.find(n => n.props?.key === 'spinner'), 'onSelect', '', {})
  expect((log[0] as Draft).mix).toEqual({ colors: 'arcade', motion: 'arcade' })
})

test('Apply has no hotkey; Cancel cancels; save-as saves the draft name', async () => {
  const { tree, log } = draw()
  const apply = tree.find(n => n.props?.key === 'apply')
  expect([apply.props.variant, apply.props.hotkey]).toEqual(['primary', undefined])
  expect(tree.find(n => n.props?.key === 'cancel').props.role).toBe('dismiss')
  call(apply, 'onPress', {})
  call(tree.find(n => n.props?.key === 'cancel'), 'onPress', {})
  call(tree.find(n => n.props?.key === 'save-as'), 'onSubmit', ' mine2 ', {})
  expect(log).toEqual(['apply', 'cancel', 'save:mine2'])
})

test('typing goes into the draft and survives a redraw', async () => {
  const { tree, log } = draw()
  const input = tree.find(n => n.props?.key === 'save-as')
  expect(input.props.placeholder).toBe('save as pack…')
  call(input, 'onInput', 'my-pa', {})
  const typed = log[0] as Draft
  expect(typed.saveAs).toBe('my-pa')
  expect(draw(typed).tree.find(n => n.props?.key === 'save-as').props.value).toBe('my-pa')
})

test('Enter on an empty save-as saves nothing', async () => {
  const { tree, log } = draw()
  call(tree.find(n => n.props?.key === 'save-as'), 'onSubmit', '  ', {})
  expect(log).toEqual([])
})

test('a mix naming a missing pack still has a matching option in every select', async () => {
  const { tree } = draw({ ...D, mix: { colors: 'gone', motion: 'gone' } })
  for (const key of ['pack', 'colors', 'motion']) {
    const s = tree.find(n => n.props?.key === key)
    expect(s.props.options.map((o: { value: string }) => o.value)).toContain(s.props.value)
  }
})

test('each row style draws its own sample lines', async () => {
  const rowsOf = (rows: string) => previewRows({ ...look, rows: rows as any }, 80, 0, false).map(r => r.map(s => s.text).join('')).slice(-6)
  const all = (rows: string) => rowsOf(rows).join('\n')
  expect(all('classic')).toContain('› fix the failing test')
  expect(all('minimal')).toContain('› fix the failing test')
  expect(all('minimal')).toContain('✓')
  expect(all('cards')).toContain('▎ you')
  expect(all('cards')).toContain('▎ claude')
  expect(all('cards')).toContain('✓')
  expect(all('retro')).toContain('[YOU] ')
  expect(all('retro')).toContain('[ OK ]')
  expect(all('retro')).toContain('[CLAUDE]')
})

test('mobile text rows carry no key on Text', async () => {
  const tree = walk(renderConfig({ Box: 'Box', Text: 'Text', Button: 'Button' }, D, look, { ...choices, pets: [...choices.pets] }, 60, 0, { change() {}, apply() {}, cancel() {}, save() {} }))
  expect(tree.filter(n => n.type === 'Text' && n.props?.key !== undefined)).toEqual([])
})

test('reduced button toggles the draft', async () => {
  const { tree, log } = draw()
  const b = tree.find(n => n.props?.key === 'reduced')
  expect(b.props.label).toBe('reduced motion: off')
  call(b, 'onPress', {})
  expect((log[0] as Draft).reduced).toBe(true)
})

test('preview rows fit the width and animate unless reduced', async () => {
  for (const w of [40, 60, 90]) for (const r of previewRows(look, w, 0, false)) expect(visibleLength(r)).toBeLessThanOrEqual(w)
  const s = (t: number, reduced: boolean) => JSON.stringify(previewRows(look, 60, t, reduced))
  expect(s(0, false)).not.toBe(s(500, false))
  expect(s(0, true)).toBe(s(500, true))
})

test('without Select and Input (mobile) the view lists commands instead', async () => {
  const tree = walk(renderConfig({ Box: 'Box', Text: 'Text', Button: 'Button' }, D, look, { ...choices, pets: [...choices.pets] }, 60, 0, { change() {}, apply() {}, cancel() {}, save() {} }))
  expect(tree.some(n => n.type === 'Select' || n.type === 'Input')).toBe(false)
  expect(JSON.stringify(tree)).toContain('/glowup pack')
})
