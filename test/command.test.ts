import { test, expect, mock } from 'claude-code/testing'
import { runGlowup, fakeHost, fakeFs } from './kit.ts'
import { runCommand, type Ctl } from '../hooks/command.ts'

test('/glowup with no args prints usage', async ($, on) => {
  fakeFs(on)
  mock.store(on)
  const out = await runGlowup($)
  expect(out.text).toContain('/glowup theme <name>')
})

const SETTINGS = '/home/u/.claude/settings.json'

const ctl = (answer = true, current = 'classic') => {
  const calls: string[] = []
  const questions: string[] = []
  const c: Ctl = {
    current: () => current,
    setTheme: async name => { calls.push('theme:' + name) },
    togglePane: async () => { calls.push('pane'); return 'glowup pane open' },
    setMotion: reduced => { calls.push('motion:' + reduced) },
    confirm: async q => { calls.push('confirm'); questions.push(q); return answer },
  }
  return { calls, questions, ctl: c }
}

test('theme switch persists the name and applies it', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'theme cyberpunk', c)).toContain('cyberpunk')
  expect(store.theme).toBe('cyberpunk')
  expect(calls).toEqual(['theme:cyberpunk'])
})

test('a user theme resolves and switches', async () => {
  const { host, store } = fakeHost({ files: { '/home/u/.claude/glowup/themes/mine.json': '{"name":"mine"}' } })
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'theme mine', c)).toBe('Theme: mine')
  expect(store.theme).toBe('mine')
  expect(calls).toEqual(['theme:mine'])
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
  expect(await runCommand(host, 'dance', c)).toContain('/glowup theme <name>')
  expect(await runCommand(host, 'motion', c)).toContain('Unknown: motion')
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
