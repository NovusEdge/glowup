import { expect, mock } from 'claude-code/testing'
import { runGlowup, fakeHost, fakeFs, test } from './kit.ts'
import { runCommand, USAGE, type Ctl } from '../hooks/command.ts'
import { SHORT_TEXT, FULL_TEXT, SECTIONS, DOCS_URL } from '../hooks/help.ts'
import { resolveLook, cleanOverrides, type Mix } from '../hooks/packs.ts'
import type { PetSetting } from '../hooks/pets.ts'
import { DEFAULT_FIELDS, type FieldId } from '../hooks/fields.ts'

test('/glowup and /glowup help print the short card', { timeoutMs: 20000 }, async ($, on) => {
  fakeFs(on)
  mock.store(on)
  for (const args of ['', 'help']) {
    const out = (await runGlowup($, args)).text!
    expect(out).toBe(SHORT_TEXT)
    for (const c of ['/glowup config', '/glowup pack <name>', '/glowup pet clawd|off', '/glowup pane', '/glowup motion reduced', '/glowup help all', DOCS_URL]) expect(out).toContain(c)
    expect(out).toContain('arcade classic cozy crt')
    expect(out).not.toContain('theme add')
  }
})

test('/glowup help all prints every command in groups', async ($, on) => {
  fakeFs(on)
  mock.store(on)
  const out = (await runGlowup($, 'help all')).text!
  expect(out).toBe(FULL_TEXT)
  for (const s of ['Start here', 'Look', 'Pet', 'Comfort', 'Make your own', 'Status line']) expect(out).toContain(s)
  for (const [, rows] of SECTIONS) for (const [c] of rows) expect(out).toContain(c)
  expect(out).toBe(USAGE)
})

test('an unknown subcommand keeps its error line above the short card', async ($, on) => {
  fakeFs(on)
  mock.store(on)
  expect((await runGlowup($, 'bogus')).text).toBe(`Unknown: bogus\n\n${SHORT_TEXT}`)
})

const SETTINGS = '/home/u/.claude/settings.json'

const ctl = (answer = true, current = 'classic') => {
  const calls: string[] = []
  const questions: string[] = []
  let mix: Mix = { colors: 'classic', motion: 'classic' }
  let pet: PetSetting = 'clawd'
  let fields: readonly FieldId[] = DEFAULT_FIELDS
  const c: Ctl = {
    current: () => current,
    setTheme: async name => { calls.push('theme:' + name) },
    togglePane: async () => { calls.push('pane'); return 'glowup pane open' },
    setMotion: reduced => { calls.push('motion:' + reduced) },
    confirm: async q => { calls.push('confirm'); questions.push(q); return answer },
    mix: () => mix,
    setMix: async m => { mix = m; calls.push(`mix:${m.colors}/${m.motion}${m.theme ? '/' + m.theme : ''}`); return [] },
    pet: () => pet,
    setPet: p => { pet = p; calls.push('pet:' + p) },
    bubbles: () => 'on',
    setBubbles: b => { calls.push('bubbles:' + b) },
    reduced: () => false,
    fields: () => fields,
    setFields: f => { fields = f ?? DEFAULT_FIELDS },
    ask: async () => { throw new Error('dismissed') },
    headless: async () => true,
  }
  return { calls, questions, ctl: c }
}

test('theme switch persists the name and applies it', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'theme cyberpunk', c)).toContain('cyberpunk')
  expect(store.theme).toBe('cyberpunk')
  expect(calls).toEqual(['mix:classic/classic/cyberpunk'])
})

test('a user theme resolves and switches', async () => {
  const { host, store } = fakeHost({ files: { '/home/u/.claude/glowup/themes/mine.json': '{"name":"mine"}' } })
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'theme mine', c)).toBe('Theme: mine')
  expect(store.theme).toBe('mine')
  expect(calls).toEqual(['mix:classic/classic/mine'])
})

test('unknown theme is refused and nothing changes', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'theme ghost', c)).toContain('no theme named "ghost"')
  expect(store.theme).toBeUndefined()
  expect(calls).toEqual([])
})

test('theme list shows built-ins and user themes and marks the active one', async () => {
  const { host } = fakeHost({ files: { '/home/u/.claude/glowup/themes/mine.json': '{"name":"mine"}' } })
  const out = await runCommand(host, 'theme list', ctl().ctl)
  for (const n of ['glowup', 'aurora', 'dusk', 'classic', 'cyberpunk', 'vaporwave', 'high-contrast', 'mine']) expect(out).toContain(n)
  expect(out).toContain('● classic')
  // the active theme may come from the plugin's userConfig, with nothing in the store
  const again = await runCommand(host, 'theme list', ctl(true, 'mine').ctl)
  expect(again).toContain('● mine')
  expect(again).toContain('○ classic')
})

test('theme add installs a downloaded theme', async () => {
  const { host, files } = fakeHost({ fetches: { 'https://x.test/n.json': '{"name":"neon"}' } })
  expect(await runCommand(host, 'theme add https://x.test/n.json', ctl().ctl)).toContain('Installed theme "neon"')
  expect(files['/home/u/.claude/glowup/themes/neon.json']).toBe('{"name":"neon"}')
})

test('pane, motion and unknown subcommands', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'pane', c)).toBe('glowup pane open')
  expect(await runCommand(host, 'motion reduced', c)).toBe('Motion: reduced.')
  expect(store.reducedMotion).toBe(true)
  expect(await runCommand(host, 'motion full', c)).toBe('Motion: full.')
  expect(store.reducedMotion).toBe(false)
  expect(calls).toEqual(['pane', 'motion:true', 'motion:false'])
  expect(await runCommand(host, 'dance', c)).toContain('/glowup help all')
})

test('a subcommand with no argument answers with its current value, never Unknown', async () => {
  const { host } = fakeHost()
  const { ctl: c } = ctl()
  const ask = (args: string) => runCommand(host, args, c)
  const pack = await ask('pack')
  expect(pack).toContain('● classic')
  expect(pack).toContain('○ arcade')
  expect(await ask('pack')).toBe(await ask('pack list'))
  expect(await ask('theme')).toBe(await ask('theme list'))
  expect(await ask('pet')).toBe(await ask('pet list'))
  expect(await ask('bubbles')).toContain('Bubbles: on')
  expect(await ask('bubbles')).toContain('/glowup bubbles on|off|haiku')
  expect(await ask('motion')).toContain('Motion: full')
  expect(await ask('statusline')).toContain('/glowup statusline on')
  expect(await ask('import')).toContain('/glowup import <file>')
  expect(await ask('export')).toContain('konsole')
  for (const sub of ['color', 'pack','theme', 'pet', 'bubbles', 'motion', 'statusline', 'import', 'export', 'spinner']) {
    expect(await ask(sub), sub).not.toContain('Unknown')
  }
})

test('color lists every role with its hex and marks overrides', async () => {
  const { host } = fakeHost()
  const { ctl: c } = ctl()
  const plain = await runCommand(host, 'color', c)
  expect(plain).toBe(await runCommand(host, 'color list', c))
  expect(plain).toContain('○ accent #d77757')
  expect(plain.split('\n').filter(l => l.startsWith('○'))).toHaveLength(14)
  expect(plain).not.toContain('(override)')
  await runCommand(host, 'color accent #0f0', c)
  const after = await runCommand(host, 'color list', c)
  expect(after).toContain('● accent #00ff00  (override)')
  expect(after).toContain('○ text')
})

test('color <role> <hex> stores an override, normalised to #rrggbb', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'color accent #ABC', c)).toBe('Color accent: #aabbcc')
  expect(await runCommand(host, 'color fail #FF0000', c)).toBe('Color fail: #ff0000')
  expect(store.mix).toEqual({ colors: 'classic', motion: 'classic', overrides: { accent: '#aabbcc', fail: '#ff0000' } })
  expect(calls).toHaveLength(2)
})

test('color refuses an unknown role and a bad hex with the reason, and stores nothing', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'color glow #fff', c)).toContain('No color role named "glow". Roles: accent, text')
  for (const hex of ['red', 'fff', '#ff', '#12345', '#gggggg', '#1234567']) expect(await runCommand(host, `color accent ${hex}`, c), hex).toContain('is not a color. Use #rgb or #rrggbb.')
  expect(await runCommand(host, 'color accent', c)).toContain('/glowup color <role> <#hex>')
  expect(store.mix).toBeUndefined()
  expect(calls).toEqual([])
})

test('color reset clears one override or all', async () => {
  const { host, store } = fakeHost()
  const { ctl: c } = ctl()
  expect(await runCommand(host, 'color reset', c)).toBe('No color overrides to clear.')
  await runCommand(host, 'color accent #111111', c)
  await runCommand(host, 'color text #222222', c)
  expect(await runCommand(host, 'color reset ghost', c)).toContain('No color role named "ghost"')
  expect(await runCommand(host, 'color reset dim', c)).toBe('dim has no override.')
  expect(await runCommand(host, 'color reset accent', c)).toContain('accent')
  expect(store.mix).toEqual({ colors: 'classic', motion: 'classic', overrides: { text: '#222222' } })
  expect(await runCommand(host, 'color reset text', c)).toContain('text')
  expect(store.mix).toEqual({ colors: 'classic', motion: 'classic' })
  await runCommand(host, 'color accent #111111', c)
  await runCommand(host, 'color text #222222', c)
  expect(await runCommand(host, 'color reset', c)).toBe('Color overrides cleared.')
  expect(store.mix).toEqual({ colors: 'classic', motion: 'classic' })
})

test('color overrides survive pack, theme and spinner changes and apply on top of them', async () => {
  const { host } = fakeHost()
  const { ctl: c } = ctl()
  await runCommand(host, 'color accent #123456', c)
  await runCommand(host, 'pack arcade', c)
  await runCommand(host, 'theme dusk', c)
  await runCommand(host, 'spinner comet', c)
  expect(c.mix().overrides).toEqual({ accent: '#123456' })
  expect(resolveLook(c.mix(), {}, {}).look.theme.colors.accent).toBe('#123456')
  expect(resolveLook({ colors: 'arcade', motion: 'arcade' }, {}, {}).look.theme.colors.accent).toBe('#ff3ec8')
  const list = await runCommand(host, 'color list', c)
  expect(list).toContain('● accent #123456  (override)')
  expect(list).toContain('○ read')
})

test('export konsole uses the overridden colors', async () => {
  const { host, files } = fakeHost()
  const { ctl: c } = ctl()
  await runCommand(host, 'color text #abcdef', c)
  const out = await runCommand(host, 'export konsole', c)
  const path = out.split('\n')[0]!
  expect(files[path]).toContain('171,205,239')
})

test('stored overrides are cleaned: unknown roles and bad colors are dropped', async () => {
  expect(cleanOverrides({ accent: '#ABC', nope: '#ffffff', text: 'blue' })).toEqual({ accent: '#aabbcc' })
  expect(cleanOverrides({ nope: '#ffffff' })).toBeUndefined()
  expect(cleanOverrides('x')).toBeUndefined()
})

test('statusline fields: set, show, default, unknown, repeats', async () => {
  const { host, store } = fakeHost()
  const { ctl: c } = ctl()
  expect(await runCommand(host, 'statusline fields', c)).toBe('Status line fields: activity ctx 5h week')
  expect(await runCommand(host, 'statusline fields 5h week 5h branch', c)).toBe('Status line fields: 5h week branch')
  expect(store.statusline).toEqual(['5h', 'week', 'branch'])
  const bad = await runCommand(host, 'statusline fields 5h nope zzz', c)
  expect(bad).toContain('Unknown fields: nope, zzz')
  expect(bad).toContain('activity, ctx, 5h')
  expect(store.statusline).toEqual(['5h', 'week', 'branch'])
  expect(await runCommand(host, 'statusline fields default', c)).toBe('Status line fields: activity ctx 5h week')
  expect('statusline' in store).toBe(false)
})

test('bare statusline names the fields subcommand', async () => {
  const { host } = fakeHost()
  expect(await runCommand(host, 'statusline', ctl().ctl)).toContain('/glowup statusline fields')
})

test('statusline on asks first; No changes nothing', async () => {
  const { host, files, store } = fakeHost({ files: { [SETTINGS]: '{"model":"opus"}' } })
  const { calls, ctl: c } = ctl(false)
  expect(await runCommand(host, 'statusline on', c)).toBe('Your status line is unchanged.')
  expect(calls).toEqual(['confirm'])
  expect(files[SETTINGS]).toBe('{"model":"opus"}')
  expect('statusline-backup' in store).toBe(false)
})

test('statusline on, then restore', async () => {
  const { host, files, store } = fakeHost({ files: { [SETTINGS]: '{"model":"opus"}' } })
  const { ctl: c } = ctl(true)
  expect(await runCommand(host, 'statusline on', c)).toContain('glowup now draws your status line')
  expect(JSON.parse(files[SETTINGS]!).statusLine.command).toContain('statusline.sh')
  expect(await runCommand(host, 'statusline restore', c)).toBe('Your status line is back.')
  expect(JSON.parse(files[SETTINGS]!)).toEqual({ model: 'opus' })
  expect('statusline-backup' in store).toBe(false)
})

test('statusline on warns when project settings set their own', async () => {
  const { host } = fakeHost({ files: { [SETTINGS]: '{}' }, projectStatusLine: true })
  const { questions, ctl: c } = ctl(true)
  const out = await runCommand(host, 'statusline on', c)
  expect(questions[0]).toContain('project or local settings')
  expect(out).toContain('project or local settings')
})

test('theme add without a URL shows usage', async () => {
  const { host } = fakeHost()
  expect(await runCommand(host, 'theme add', ctl().ctl)).toContain('/glowup theme add <url>')
})

const PACKS_DIR = '/home/u/.claude/glowup/packs'

test('pack <name> stores both layers and applies them', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'pack arcade', c)).toBe('Pack: arcade')
  expect(store.mix).toEqual({ colors: 'arcade', motion: 'arcade' })
  expect(calls).toEqual(['mix:arcade/arcade'])
})

test('an unknown pack changes nothing', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'pack ghost', c)).toContain('no pack named "ghost"')
  expect(store.mix).toBeUndefined()
  expect(calls).toEqual([])
})

test('spinner <name> sets the override and persists the mix', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'spinner comet', c)).toBe('Spinner: comet')
  expect(store.mix).toEqual({ colors: 'classic', motion: 'classic', spinner: 'comet' })
  expect(calls).toEqual(['mix:classic/classic'])
})

test('an unknown spinner is refused and lists the valid ones', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  const out = await runCommand(host, 'spinner nope', c)
  for (const n of ['stock', 'comet', 'eyes', 'orb-states', 'clawd', 'shimmer']) expect(out).toContain(n)
  expect(store.mix).toBeUndefined()
  expect(calls).toEqual([])
})

test('spinner list marks the override, else the pack spinner', async () => {
  const { host } = fakeHost()
  const { ctl: c } = ctl()
  expect(await runCommand(host, 'spinner list', c)).toContain('● stock')
  await c.setMix({ colors: 'crt', motion: 'crt' })
  expect(await runCommand(host, 'spinner list', c)).toContain('● comet')
  await runCommand(host, 'spinner eyes', c)
  const out = await runCommand(host, 'spinner list', c)
  expect(out).toContain('● eyes')
  expect(out).toContain('○ comet')
})

test('spinner default clears the override and keeps the rest of the mix', async () => {
  const { host, store } = fakeHost()
  const { ctl: c } = ctl()
  await c.setMix({ colors: 'cozy', motion: 'cozy', theme: 'dusk', spinner: 'comet' })
  expect(await runCommand(host, 'spinner default', c)).toBe('Spinner: pack default')
  expect(store.mix).toEqual({ colors: 'cozy', motion: 'cozy', theme: 'dusk' })
  expect(c.mix().spinner).toBeUndefined()
})

test('spinner with no argument prints usage', async () => {
  const { host } = fakeHost()
  expect(await runCommand(host, 'spinner', ctl().ctl)).toBe(USAGE)
  expect(USAGE).toContain('/glowup spinner')
})

test('pack list marks the active pack or the custom mix', async () => {
  const { host } = fakeHost({ files: { [`${PACKS_DIR}/mine.json`]: '{"format":1,"name":"mine"}' } })
  const { ctl: c } = ctl()
  const out = await runCommand(host, 'pack list', c)
  for (const n of ['classic', 'crt', 'cozy', 'arcade', 'mine']) expect(out).toContain(n)
  expect(out).toContain('● classic')
  await c.setMix({ colors: 'crt', motion: 'cozy' })
  expect(await runCommand(host, 'pack list', c)).toContain('custom mix: colors crt, motion cozy')
})

test('pack save writes the current mix as a self-contained file', async () => {
  const { host, files } = fakeHost()
  const { ctl: c } = ctl()
  await c.setMix({ colors: 'crt', motion: 'cozy' })
  expect(await runCommand(host, 'pack save mine', c)).toContain('Saved pack "mine"')
  const file = JSON.parse(files[`${PACKS_DIR}/mine.json`]!)
  expect([file.format, file.colors.rows, file.motion.spinner]).toEqual([1, 'retro', 'eyes'])
})

test('pack <url> installs then applies; --force replaces', async () => {
  const { host, store } = fakeHost({ fetches: { 'https://x.dev/n.json': '{"format":1,"name":"neon","extends":"arcade"}' } })
  const { ctl: c } = ctl()
  expect(await runCommand(host, 'pack https://x.dev/n.json', c)).toBe('Pack: neon')
  expect(store.mix).toEqual({ colors: 'neon', motion: 'neon' })
  expect(await runCommand(host, 'pack https://x.dev/n.json', c)).toContain('--force')
  expect(await runCommand(host, 'pack https://x.dev/n.json --force', c)).toContain('neon')
})

test('theme <name> keeps the pack and sets mix.theme', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  await runCommand(host, 'pack arcade', c)
  expect(await runCommand(host, 'theme dusk', c)).toBe('Theme: dusk')
  expect(store.mix).toEqual({ colors: 'arcade', motion: 'arcade', theme: 'dusk' })
  expect(store.theme).toBe('dusk')
  expect(calls.at(-1)).toBe('mix:arcade/arcade/dusk')
})

test('theme default drops the theme from the mix and the store, keeping the pack', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  await runCommand(host, 'pack arcade', c)
  await runCommand(host, 'theme dusk', c)
  expect(await runCommand(host, 'theme default', c)).toBe('Theme: pack default')
  expect(store.mix).toEqual({ colors: 'arcade', motion: 'arcade' })
  expect(store.theme).toBeUndefined()
  expect(calls.at(-1)).toBe('mix:arcade/arcade')
})

test('import reads a scheme and applies its colors layer', async () => {
  const ghostty = ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2'].map((x, i) => `palette = ${i}=${x}`).join('\n') + '\nbackground = #282a36\nforeground = #f8f8f2'
  const { host, files, store } = fakeHost({ runs: { 'head -c 65537 /home/u/schemes/dracula': { exitCode: 0, stdout: ghostty } } })
  const { ctl: c } = ctl()
  await runCommand(host, 'pack cozy', c)
  expect(await runCommand(host, 'import ~/schemes/dracula', c)).toContain('dracula')
  expect(JSON.parse(files[`${PACKS_DIR}/dracula.json`]!).colors.palette.text).toBe('#f8f8f2')
  expect(store.mix).toEqual({ colors: 'dracula', motion: 'cozy' })
  expect(await runCommand(host, 'import ~/nope', c)).toContain('Could not read')
})

test('import refuses a file over 64 KB before reading it', async () => {
  const { host, ran } = fakeHost({ runs: { 'head -c 65537 /home/u/big': { exitCode: 0, stdout: 'x'.repeat(65537) } } })
  expect(await runCommand(host, 'import ~/big', ctl().ctl)).toContain('over 64 KB')
  expect(ran).toEqual(['head -c 65537 /home/u/big'])
})

test('pet and bubbles; clawd-shiny stays locked until earned', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'pet off', c)).toBe('Pet: off')
  expect(await runCommand(host, 'pet clawd-shiny', c)).toContain('not unlocked')
  store.eggs = { passRuns: 100, shinyAt: 1 }
  expect(await runCommand(host, 'pet clawd-shiny', c)).toBe('Pet: clawd-shiny')
  expect(await runCommand(host, 'pet list', c)).toContain('● clawd-shiny')
  expect(await runCommand(host, 'bubbles off', c)).toBe('Bubbles: off')
  expect([store.pet, store.bubbles]).toEqual(['clawd-shiny', 'off'])
  expect(await runCommand(host, 'bubbles haiku', c)).toBe('Bubbles: haiku')
  expect(store.bubbles).toBe('haiku')
  expect(calls).toEqual(['pet:off', 'pet:clawd-shiny', 'bubbles:off', 'bubbles:haiku'])
})
