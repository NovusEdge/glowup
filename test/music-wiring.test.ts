import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { fakeFs, test } from './kit.ts'

const ENGINE_ROW = { type: 'Text', props: {}, children: ['engine row'] } as RenderElement
const scroll = { offset: 0, bodyRows: 40 }
const PANE = { title: 'glowup', isFocused: false, bodyColumns: 60, placement: 'dock', scroll, view: {} } as never
const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const petClient = (tree: any) => walk(tree).find(n => n?.type === 'Client' && String(n.props?.module).endsWith('client/pet.tsx'))
const text = (tree: any) => walk(tree).filter(n => typeof n === 'string').join(' ')
const mountPane = ($: any) => $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'Pane', requestId: 'glowup', props: PANE })

const DEST = 'org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player'
const BUS = `busctl --user --json=short get-property ${DEST} PlaybackStatus Metadata Position`
const PLAY_PAUSE = `busctl --user call ${DEST} PlayPause`
const PLAYING = ['{"type":"s","data":"Playing"}', '{"type":"a{sv}","data":{"mpris:trackid":{"type":"s","data":"/com/spotify/track/t"},"xesam:title":{"type":"s","data":"Song"},"mpris:length":{"type":"t","data":9000000}}}', '{"type":"x","data":1000000}'].join('\n')
const ok = (stdout = '') => ({ exitCode: 0, stdout })

function boot(on: any, files: Record<string, string>, answers: Record<string, { exitCode: number; stdout: string }>) {
  const ran: string[] = []
  const fs = fakeFs(on, files, argv => { const k = argv.join(' '); ran.push(k); return answers[k] })
  mock.store(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  on('ui.render', async () => ENGINE_ROW)
  on('ui.panes', async () => ({ value: [{ id: 'glowup', isShown: true, isPlaced: true }] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: {}, text: '' }) as never)
  return { ...fs, ran }
}
const reads = (ran: string[]) => ran.filter(a => a === BUS).length

const LINUX_BUS = { 'uname -s': ok('Linux\n'), 'busctl --version': ok('systemd 258') }

test('Spotify playing: the Music tab shows the track, the pet dances, a press runs PlayPause', { timeoutMs: 20000 }, async ($, on) => {
  const { ran } = boot(on, {}, { ...LINUX_BUS, [BUS]: ok(PLAYING), [PLAY_PAUSE]: ok() })
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-music' })
  await clock.advance(50)
  const tree = await pane.drawn()
  expect(text(tree)).toContain('NOW PLAYING')
  expect(text(tree)).toContain('Song')
  expect(petClient(tree).props.props.input.music).toBe(true)
  await pane.press({ key: 'music-playpause' })
  await clock.advance(50)
  expect(ran).toContain(PLAY_PAUSE)
  await pane.unmount()
})

test('Spotify closed: the tab says so and the pet does not dance', { timeoutMs: 20000 }, async ($, on) => {
  boot(on, {}, { ...LINUX_BUS, [BUS]: { exitCode: 1, stdout: '' } })
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-music' })
  await clock.advance(50)
  const tree = await pane.drawn()
  expect(text(tree)).toContain("Open Spotify to see what's playing.")
  expect(petClient(tree).props.props.input.music).toBeFalsy()
  await pane.unmount()
})

test('a press during a read leaves one poll loop', { timeoutMs: 20000 }, async ($, on) => {
  const { ran } = boot(on, {}, { ...LINUX_BUS, [BUS]: ok(PLAYING), [PLAY_PAUSE]: ok() })
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  // the controls render only on the Music tab: open it, press twice, then leave it so the cadence is 2 s
  const p = await mountPane($)
  await p.press({ key: 'tab-music' })
  await clock.advance(50)
  await p.press({ key: 'music-playpause' })
  await p.press({ key: 'music-playpause' })
  await p.press({ key: 'tab-plan' })
  await clock.advance(50)
  const before = reads(ran)
  for (let i = 0; i < 20; i++) await clock.advance(1000)
  // one loop at 2 s is 10 reads in 20 s; two loops would be 20 or more
  expect(reads(ran) - before).toBeLessThanOrEqual(11)
  expect(reads(ran) - before).toBeGreaterThanOrEqual(9)
  await p.unmount()
})

const DIR = '/fake/.claude/glowup/instances'

test('a copy that is off never polls Spotify', { timeoutMs: 20000 }, async ($, on) => {
  const files = {
    '/fake/.claude/settings.json': '{}',
    '/elsewhere/glowup/.claude-plugin/plugin.json': '{}',
    [`${DIR}/s1.aa.json`]: JSON.stringify({ root: '/elsewhere/glowup', at: Date.now() - 1000 }),
  }
  const { ran } = boot(on, files, { ...LINUX_BUS, [BUS]: ok(PLAYING) })
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(20_000)
  expect(ran.filter(a => a.startsWith('busctl'))).toEqual([])
})
