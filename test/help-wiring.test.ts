import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { runGlowup, fakeFs, test } from './kit.ts'
import { SHORT_TEXT, FULL_TEXT, SECTIONS, DOCS_URL } from '../hooks/help.ts'
import { resolveLook } from '../hooks/packs.ts'

const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const texts = (n: any) => walk(n).filter(x => typeof x === 'string').join('')
const colorOf = (drawn: any, text: string) => walk(drawn).find(n => n?.children?.[0] === text && n?.props)?.props

const setup = (on: any) => {
  fakeFs(on)
  mock.store(on)
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  on('session.id', async () => ({ value: 's1' }))
}
const row = (args: string, text: string, over: object = {}) => ({ command: 'glowup', args, text, isErrored: false, ...over }) as never
const mountRow = ($: any, props: unknown, surface: string = 'terminal') => $.ui.mount({ plugin: 'glowup', surface, component: 'CommandOutput', props })
const classic = resolveLook({ colors: 'classic', motion: 'classic' }, {}, {}).look

test('the short card draws the header, five rows and the footer in the look colors', { timeoutMs: 20000 }, async ($, on) => {
  setup(on)
  for (const args of ['', 'help']) {
    const ui = await mountRow($, row(args, SHORT_TEXT))
    const drawn = await ui.drawn()
    const all = texts(drawn)
    expect(all).not.toContain('engine')
    expect(all).toContain('glowup')
    expect(walk(drawn).filter(n => n?.children?.[0] === '██')).toHaveLength(5)
    expect(all).toContain('✻ ')
    expect(all).toContain('/glowup pack <name>')
    expect(all).toContain('/glowup help all')
    expect(all).toContain(DOCS_URL)
    expect(all).not.toContain('Make your own')
    expect(colorOf(drawn, 'glowup')).toMatchObject({ color: classic.theme.colors.accent, bold: true })
    expect(colorOf(drawn, '/glowup help all')?.color).toBe(classic.theme.colors.accent)
    expect(colorOf(drawn, 'more: ')?.color).toBe(classic.theme.colors.dim)
    expect(walk(drawn).some(n => n?.props?.borderStyle === classic.border)).toBe(true)
    await ui.unmount()
  }
})

test('the full list draws every section heading and command', async ($, on) => {
  setup(on)
  const ui = await mountRow($, row('help all', FULL_TEXT))
  const drawn = await ui.drawn()
  const all = texts(drawn)
  for (const [title, rows] of SECTIONS) {
    expect(all).toContain(title)
    expect(colorOf(drawn, title)).toMatchObject({ color: classic.theme.colors.accent, bold: true })
    for (const [c, what] of rows) {
      expect(colorOf(drawn, `  ${c.padEnd(36)} `)).toMatchObject({ color: classic.theme.colors.text, bold: true })
      expect(all).toContain(what)
    }
  }
  await ui.unmount()
})

test('the card follows the current look', async ($, on) => {
  setup(on)
  await runGlowup($, 'pack arcade')
  const ui = await mountRow($, row('', SHORT_TEXT))
  expect(colorOf(await ui.drawn(), 'glowup')?.color).toBe('#ff3ec8')
  await ui.unmount()
})

test('other rows, errors and altered help text pass through', async ($, on) => {
  setup(on)
  for (const props of [
    row('pack crt', 'Pack: crt'),
    row('', SHORT_TEXT, { command: 'other' }),
    row('', SHORT_TEXT, { isErrored: true }),
    row('bogus', `Unknown: bogus\n\n${SHORT_TEXT}`),
    row('help all', SHORT_TEXT),
  ]) {
    const ui = await mountRow($, props)
    expect(texts(await ui.drawn())).toBe('engine')
    await ui.unmount()
  }
})

test('surfaces that cannot draw it get the engine row, which carries the plain text', async ($, on) => {
  setup(on)
  const ui = await mountRow($, row('', SHORT_TEXT), 'vscode')
  expect(texts(await ui.drawn())).toBe('engine')
  await ui.unmount()
})
