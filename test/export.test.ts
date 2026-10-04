import { test, expect, mock } from 'claude-code/testing'
import { runGlowup, fakeHost, fakeFs } from './kit.ts'
import { runCommand, type Ctl } from '../hooks/command.ts'

const ctl = (colors = 'classic'): Ctl => ({
  current: () => 'classic', setTheme: async () => {}, togglePane: async () => '', setMotion: () => {}, confirm: async () => true,
  mix: () => ({ colors, motion: colors }), setMix: async () => [], pet: () => 'clawd', setPet: () => {},
  bubbles: () => 'on', setBubbles: () => {}, reduced: () => false, ask: async () => { throw new Error('dismissed') }, headless: async () => true,
})

const HINT = 'In Konsole: Settings → Edit Current Profile → Appearance → pick "glowup arcade".'

test('export konsole writes the scheme under the host data dir', async () => {
  const { host, files } = fakeHost()
  const out = await runCommand(host, 'export konsole', ctl('arcade'))
  const path = '/home/u/.local/share/konsole/glowup-arcade.colorscheme'
  expect(out).toBe(`${path}\n${HINT}`)
  expect(files[path]).toContain('Description=glowup arcade')
})

test('export konsole replaces an earlier file of the same name', async () => {
  const path = '/home/u/.local/share/konsole/glowup-arcade.colorscheme'
  const { host, files } = fakeHost({ files: { [path]: 'old' } })
  await runCommand(host, 'export konsole', ctl('arcade'))
  expect(files[path]).toContain('[Background]')
})

test('export with no or an unknown target lists the targets', async () => {
  const { host, files } = fakeHost()
  for (const a of ['export', 'export nope']) expect(await runCommand(host, a, ctl())).toBe('Export targets: konsole')
  expect(Object.keys(files)).toEqual([])
})

// session.start is where register.tsx reads the env, so the engine boots first
const engine = async ($: any, on: any, env?: Record<string, string>) => {
  const fs = fakeFs(on, {}, undefined, env)
  mock.clock(on)
  mock.store(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  return fs
}

test('XDG_DATA_HOME wins over $HOME/.local/share through the engine', async ($, on) => {
  const { files } = await engine($, on, { XDG_DATA_HOME: '/xdg' })
  expect((await runGlowup($, 'export konsole')).text).toContain('/xdg/konsole/glowup-classic.colorscheme')
  expect(Object.keys(files)).toEqual(['/xdg/konsole/glowup-classic.colorscheme'])
})

test('without XDG_DATA_HOME the file lands in $HOME/.local/share', async ($, on) => {
  const { files } = await engine($, on)
  await runGlowup($, 'export konsole')
  expect(Object.keys(files)).toEqual(['/fake/.local/share/konsole/glowup-classic.colorscheme'])
})
