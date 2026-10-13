import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { fakeFs, runGlowup, test } from './kit.ts'

const DEST = 'org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player'
const BUS = `busctl --user --json=short get-property ${DEST} PlaybackStatus Metadata Position`
const PLAYING = ['{"type":"s","data":"Playing"}', '{"type":"a{sv}","data":{"mpris:trackid":{"type":"s","data":"/com/spotify/track/t"},"xesam:title":{"type":"s","data":"Song"},"mpris:length":{"type":"t","data":9000000},"xesam:url":{"type":"s","data":"https://open.spotify.com/track/t"}}}', '{"type":"x","data":1000000}'].join('\n')
const ok = (stdout = '') => ({ exitCode: 0, stdout })
const LINUX_BUS = { 'uname -s': ok('Linux\n'), 'busctl --json=short --version': ok('systemd 258') }
const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const text = (tree: any) => walk(tree).filter(n => typeof n === 'string').join(' ')
const PANE_PROPS = (bodyRows = 40) => ({ title: 'glowup', isFocused: true, bodyColumns: 88, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} }) as never

let failOpen = ''

// panes: what $.ui.panes() answers, edited by the test as the engine would move them
function boot(on: any, answers: Record<string, { exitCode: number; stdout: string }>, copy: { value: unknown } = { value: { isCopied: true } }, files: Record<string, string> = {}, env: Record<string, string> = {}) {
  failOpen = ''
  const ran: string[] = [], opens: any[] = [], closes: any[] = [], copies: string[] = [], toasts: string[] = []
  const panes: { id: string; isShown: boolean; isFocused: boolean; isPlaced: boolean }[] = []
  fakeFs(on, files, argv => { const k = argv.join(' '); ran.push(k); return answers[k] }, env)
  mock.store(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  on('ui.panes', async () => ({ value: panes.map(p => ({ ...p, title: p.id })) }) as never)
  on('ui.open', async (_$: unknown, e: any) => {
    opens.push(e)
    if (e.id === failOpen) throw new Error('no room')
    for (const p of panes) p.isShown = false
    const p = panes.find(x => x.id === e.id)
    if (p) p.isShown = true; else panes.push({ id: e.id, isShown: true, isFocused: !!e.focus, isPlaced: true })
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', async (_$: unknown, e: any) => {
    closes.push(e)
    panes.splice(panes.findIndex(p => p.id === e.id) >>> 0, 1)
    return { value: undefined } as never
  })
  on('ui.copy', async (_$: unknown, e: any) => { copies.push(e.text); if (copy.value instanceof Error) throw copy.value; return copy as never })
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$: unknown, e: any) => { toasts.push(e.text); return { value: undefined } as never })
  on('session.id', async () => ({ value: 's1' }))
  on('session.surfaces', async () => ({ value: ['terminal'] }) as never)
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  return { ran, opens, closes, copies, toasts, panes }
}
const start = async ($: any, on: any) => {
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  return clock
}
const mountPlayer = ($: any, bodyRows = 24, surface = 'terminal') => $.ui.mount({ plugin: 'glowup', surface, component: 'Pane', requestId: 'glowup-music', props: { ...(PANE_PROPS(bodyRows) as object), title: 'Music' } })
// A test's $ cannot raise the person's Esc, so the dialog closes the way a plugin may: the command, which toggles it.
const closeDialog = async ($: any) => expect((await runGlowup($, 'music')).text).toBe('Music player closed')
const mountPane =($: any) => $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'Pane', requestId: 'glowup', props: PANE_PROPS() })

test('/glowup music opens the focused dialog and leaves the glowup pane alone', async ($, on) => {
  const s = boot(on, { ...LINUX_BUS, [BUS]: ok(PLAYING) })
  await start($, on)
  s.panes.push({ id: 'glowup', isShown: true, isFocused: false, isPlaced: true })
  const out = await runGlowup($, 'music')
  expect(out.text).toBe('Music player open (Esc closes it)')
  expect(s.opens.map(o => o.id)).toEqual(['glowup-music'])
  expect(s.opens[0]).toMatchObject({ focus: true, closeOnEscape: true, holdToasts: true, rows: 24, columns: 110, title: 'Music' })
  expect(s.closes).toEqual([])
  await closeDialog($)
  expect(s.opens.map(o => o.id)).toEqual(['glowup-music'])
})

test('Player from the pane closes it and the dialog close reopens it with the keys', async ($, on) => {
  const s = boot(on, { ...LINUX_BUS, [BUS]: ok(PLAYING) })
  const clock = await start($, on)
  s.panes.push({ id: 'glowup', isShown: true, isFocused: true, isPlaced: true })
  const pane = await mountPane($)
  await pane.press({ key: 'tab-music' })
  await clock.advance(50)
  await pane.press({ key: 'music-player' })
  expect(s.closes.map(c => c.id)).toEqual(['glowup'])
  expect(s.opens.map(o => o.id)).toEqual(['glowup-music'])
  await closeDialog($)
  expect(s.opens.map(o => o.id)).toEqual(['glowup-music', 'glowup'])
  expect(s.opens[1].focus).toBe(true)
  // a second close of the dialog does not reopen the pane again
  await runGlowup($, 'music')
  await closeDialog($)
  expect(s.opens.map(o => o.id)).toEqual(['glowup-music', 'glowup', 'glowup-music'])
  await pane.unmount()
})

test('the dialog draws the track and its Clients, and a press reaches Spotify', async ($, on) => {
  const NEXT = `busctl --user call ${DEST} Next`
  const s = boot(on, { ...LINUX_BUS, [BUS]: ok(PLAYING), [NEXT]: ok() })
  const clock = await start($, on)
  await runGlowup($, 'music')
  await clock.advance(50)
  const ui = await mountPlayer($)
  const tree = await ui.drawn()
  expect(text(tree)).toContain('Song')
  const seek = walk(tree).find(n => n?.type === 'Client' && n.props?.key === 'glowup-seek')
  expect(seek.props.props).toMatchObject({ kind: 'progress', durationMs: 9000, playing: true })
  // Linux: Spotify ignores Volume writes, so no volume Client
  expect(walk(tree).some(n => n?.props?.key === 'glowup-volume')).toBe(false)
  await ui.press({ key: 'music-next' })
  await clock.advance(50)
  expect(s.ran).toContain(NEXT)
  await ui.unmount()
})

test('a refused copy says why inside the dialog', async ($, on) => {
  const copy = { value: { isCopied: false, reason: 'no clipboard on this surface' } as unknown }
  const s = boot(on, { ...LINUX_BUS, [BUS]: ok(PLAYING) }, copy)
  const clock = await start($, on)
  await runGlowup($, 'music')
  await clock.advance(50)
  const ui = await mountPlayer($)
  await ui.press({ key: 'music-copy' })
  expect(s.copies).toEqual(['https://open.spotify.com/track/t'])
  expect(await ui.find({ text: /Could not copy the link: no clipboard on this surface/ })).toBeDefined()
  copy.value = new Error('clipboard busy')
  await ui.press({ key: 'music-copy' })
  // the engine skips a hook that throws, so the reason is its own wording, not the message
  expect(await ui.find({ text: /Could not copy the link: \S/ })).toBeDefined()
  expect(await ui.find({ text: /no clipboard on this surface/ })).toBeUndefined()
  copy.value = { isCopied: true }
  await ui.press({ key: 'music-copy' })
  expect(await ui.find({ text: /Link copied\./ })).toBeDefined()
  expect(s.toasts).toEqual([])
  await ui.unmount()
})

test('while the dialog shows, Spotify is read every second and its cover is fetched at 20', async ($, on) => {
  const ART = '/gi spotify-art --size 20 https://i.scdn.co/image/ab67616d00004851d1'
  const WITH_ART = PLAYING.replace('"xesam:url"', '"mpris:artUrl":{"type":"s","data":"https://i.scdn.co/image/ab67616d0000b273d1"},"xesam:url"')
  const s = boot(on, { ...LINUX_BUS, [BUS]: ok(WITH_ART) }, undefined, { '/gi': '' }, { GLOWUP_BIN: '/gi' })
  const clock = await start($, on)
  await runGlowup($, 'music')
  const ui = await mountPlayer($, 24)
  await clock.advance(50)
  const before = s.ran.filter(a => a === BUS).length
  for (let i = 0; i < 6; i++) await clock.advance(1000)
  expect(s.ran.filter(a => a === BUS).length - before).toBeGreaterThanOrEqual(5)
  expect(s.ran).toContain(ART)
  await ui.unmount()
})

test('a paused track\'s cover is fetched at the dialog size on its first draw', async ($, on) => {
  const ART = '/gi spotify-art --size 20 https://i.scdn.co/image/ab67616d00004851d1'
  const PAUSED = PLAYING.replace('"Playing"', '"Paused"').replace('"xesam:url"', '"mpris:artUrl":{"type":"s","data":"https://i.scdn.co/image/ab67616d0000b273d1"},"xesam:url"')
  const s = boot(on, { ...LINUX_BUS, [BUS]: ok(PAUSED) }, undefined, { '/gi': '' }, { GLOWUP_BIN: '/gi' })
  const clock = await start($, on)
  await runGlowup($, 'music')
  const ui = await mountPlayer($, 24)
  await ui.drawn()
  await clock.advance(50)
  expect(s.ran).toContain(ART)
  await ui.unmount()
})

test('a dialog that fails to open leaves the glowup pane open and focused', async ($, on) => {
  const s = boot(on, { ...LINUX_BUS, [BUS]: ok(PLAYING) })
  failOpen = 'glowup-music'
  const clock = await start($, on)
  s.panes.push({ id: 'glowup', isShown: true, isFocused: true, isPlaced: true })
  const pane = await mountPane($)
  await pane.press({ key: 'tab-music' })
  await clock.advance(50)
  await pane.press({ key: 'music-player' })
  await clock.advance(50)
  expect(s.closes.map(c => c.id)).toEqual(['glowup'])
  expect(s.opens.at(-1)).toMatchObject({ id: 'glowup', focus: true })
  await pane.unmount()
})
