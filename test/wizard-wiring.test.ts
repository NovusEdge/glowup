import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { runGlowup, fakeFs, test } from './kit.ts'
import { USAGE } from '../hooks/command.ts'

const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const texts = (n: any) => walk(n).filter(x => typeof x === 'string').join('')

// each AskUserQuestion tool call takes the next answer; undefined rejects like Esc
const setup = (on: any, answers: (string | undefined)[], surfaces: string[] = ['terminal'], files: Record<string, string> = {}) => {
  fakeFs(on, files)
  mock.store(on)
  const asked: any[] = []
  const opens: unknown[] = []
  on('tool.call', async (_$: unknown, e: any) => {
    if (e.tool !== 'AskUserQuestion') return { result: {}, text: '' } as never
    const q = e.questions[0]
    asked.push(q)
    const a = answers.shift()
    if (a === undefined) throw new Error('dismissed')
    return { result: { questions: [], answers: { [q.question]: a } }, text: a } as never
  })
  on('ui.open', async (_$: unknown, e: unknown) => { opens.push(e); return { value: { isPlaced: true } } as never })
  on('ui.panes', async () => ({ value: [] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  on('session.surfaces', async () => ({ value: surfaces }) as never)
  on('session.id', async () => ({ value: 's1' }))
  return { asked, opens }
}

const ROW = (text: string, over: object = {}) => ({ command: 'glowup', args: 'config', text, isErrored: false, ...over }) as never
const mountRow = ($: any, props: unknown, surface = 'terminal') => $.ui.mount({ plugin: 'glowup', surface, component: 'CommandOutput', props })

test('/glowup config asks through the engine dialog, applies each pick and never opens the pane', { timeoutMs: 20000 }, async ($, on) => {
  const s = setup(on, ['arcade', 'Pack default', 'No pet', 'Turn bubbles off'])
  const out = await runGlowup($, 'config')
  expect(s.asked.map(q => q.header)).toEqual(['Pack', 'Spinner', 'Pet', 'Extras'])
  expect(s.asked[0].options.map((o: any) => o.label)).toEqual(['arcade', 'classic (current)', 'cozy', 'crt'])
  expect(s.asked[1].options.map((o: any) => o.label)).toEqual(['Pack default', 'stock', 'comet', 'eyes'])
  expect(s.asked[3].multiSelect).toBe(true)
  expect(out.text).toBe('glowup · arcade · no pet · bubbles off · full motion')
  expect((await runGlowup($, 'pack list')).text).toContain('● arcade')
  expect((await runGlowup($, 'pet list')).text).toContain('● off')
  expect(s.opens).toEqual([])
})

test('Esc mid-way keeps what was picked', async ($, on) => {
  setup(on, ['cozy'])
  const out = await runGlowup($, 'config')
  expect(out.text).toContain('cozy')
  expect((await runGlowup($, 'pack list')).text).toContain('● cozy')
})

test('a headless run gets the usage text', async ($, on) => {
  setup(on, [], [])
  expect((await runGlowup($, 'config')).text).toBe(USAGE)
})

test('Esc on the first question in a live session is not usage', async ($, on) => {
  setup(on, [])
  const out = await runGlowup($, 'config')
  expect(out.text).toContain('glowup · classic')
})

test('the config row draws a summary with swatches and the spinner word', async ($, on) => {
  setup(on, ['arcade', 'Pack default', 'Clawd', ''])
  const text = (await runGlowup($, 'config')).text!
  for (const surface of ['terminal', 'desktop']) {
    const ui = await mountRow($, ROW(text), surface)
    const drawn = await ui.drawn()
    const all = walk(drawn)
    expect(texts(drawn)).toContain(text)
    expect(all.filter(n => n?.children?.[0] === '██')).toHaveLength(5)
    expect(all.some(n => n?.props?.color && texts(n).endsWith('…'))).toBe(true)
    expect(texts(drawn)).not.toContain('engine')
    await ui.unmount()
  }
})

test('an old summary row keeps its own pack colors after the look changes', async ($, on) => {
  setup(on, ['arcade', 'Pack default', 'Clawd', ''])
  const text = (await runGlowup($, 'config')).text!
  await runGlowup($, 'pack crt')
  const ui = await mountRow($, ROW(text))
  const swatches = walk(await ui.drawn()).filter(n => n?.children?.[0] === '██')
  expect(swatches[0].props.color).toBe('#ff3ec8')
  await ui.unmount()
})

test('a summary with a spinner segment still draws as the card, in the pack\'s colors, live or old', async ($, on) => {
  setup(on, ['arcade', 'comet', 'Clawd', ''])
  const text = (await runGlowup($, 'config')).text!
  expect(text).toBe('glowup · arcade · spinner comet · Clawd · bubbles on · full motion')
  for (const pack of [undefined, 'crt']) {
    if (pack) await runGlowup($, `pack ${pack}`)
    const ui = await mountRow($, ROW(text))
    const all = walk(await ui.drawn())
    expect(texts(await ui.drawn())).toContain(text)
    const swatches = all.filter(n => n?.children?.[0] === '██')
    expect(swatches).toHaveLength(5)
    expect(swatches[0].props.color).toBe('#ff3ec8')
    await ui.unmount()
  }
})

test('a live user pack with a spinner override still draws as the card', async ($, on) => {
  const pack = { format: 1, name: 'mine', colors: { theme: 'classic', palette: { accent: '#123456' } } }
  setup(on, [], ['terminal'], { '/fake/.claude/glowup/packs/mine.json': JSON.stringify(pack) })
  mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }) as never)
  // the config dir is read at session.start
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect((await runGlowup($, 'pack mine')).text).toBe('Pack: mine')
  await runGlowup($, 'spinner comet')
  const text = 'glowup · mine · spinner comet · Clawd · bubbles on · full motion'
  const ui = await mountRow($, ROW(text))
  const swatches = walk(await ui.drawn()).filter(n => n?.children?.[0] === '██')
  expect(swatches).toHaveLength(5)
  expect(swatches[0].props.color).toBe('#123456')
  await ui.unmount()
})

test('a summary naming a pack that cannot be resolved passes through', async ($, on) => {
  setup(on, [])
  const ui = await mountRow($, ROW('glowup · ghost · Clawd · bubbles on · full motion'))
  expect(texts(await ui.drawn())).toBe('engine')
  await ui.unmount()
})

test('every other command row passes through', async ($, on) => {
  setup(on, [])
  for (const props of [ROW('Pack: crt', { args: 'pack crt' }), ROW('glowup · x', { command: 'other' }), ROW('No pack named "x".', { isErrored: true })]) {
    const ui = await mountRow($, props)
    expect(texts(await ui.drawn())).toBe('engine')
    await ui.unmount()
  }
})

test('the glowup pane has no config view left', async ($, on) => {
  setup(on, ['crt', 'Clawd', ''])
  await runGlowup($, 'config')
  const ui = await $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'Pane', requestId: 'glowup', props: { title: 'glowup', isFocused: true, bodyColumns: 70, placement: 'inline', scroll: { offset: 0, bodyRows: 30 }, view: {} } })
  expect(await ui.find({ text: 'Changes' })).toBeDefined()
  expect(await ui.find({ text: /Apply/ })).toBeUndefined()
  await ui.unmount()
})
