import { test, expect } from 'claude-code/testing'
import { fakeHost } from './kit.ts'
import { MusicReader, pickBackend, LINUX_HINT, WINDOWS_HINT } from '../hooks/music/reader.ts'
import type { Host } from '../hooks/host.ts'

const BUS = 'busctl --user --json=short get-property org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player PlaybackStatus Metadata Position'
const PLAYING = ['{"type":"s","data":"Playing"}', '{"type":"a{sv}","data":{"mpris:trackid":{"type":"s","data":"/com/spotify/track/t"},"xesam:title":{"type":"s","data":"S"},"mpris:length":{"type":"t","data":9000000}}}', '{"type":"x","data":1000000}'].join('\n')

test('backend: busctl first, then playerctl, osascript on mac, none on windows', async () => {
  expect(await pickBackend(fakeHost({ runs: { 'busctl --json=short --version': { exitCode: 0, stdout: 'systemd 258' } } }).host, 'linux')).toBe('busctl')
  // systemd older than 240 answers --version but rejects --json
  expect(await pickBackend(fakeHost({ runs: { 'busctl --version': { exitCode: 0, stdout: 'systemd 237' }, 'playerctl --version': { exitCode: 0, stdout: 'v2.4.1' } } }).host, 'linux')).toBe('playerctl')
  expect(await pickBackend(fakeHost({ runs: { 'playerctl --version': { exitCode: 0, stdout: 'v2.4.1' } } }).host, 'linux')).toBe('playerctl')
  expect(await pickBackend(fakeHost().host, 'linux')).toBeUndefined()
  expect(await pickBackend(fakeHost().host, 'mac')).toBe('osascript')
  expect(await pickBackend(fakeHost().host, 'windows')).toBeUndefined()
})

test('no backend reads as unsupported with the platform hint', async () => {
  expect(await new MusicReader(undefined, 'linux').read(fakeHost().host, 0)).toEqual({ status: 'unsupported', hint: LINUX_HINT })
  expect(await new MusicReader(undefined, 'windows').read(fakeHost().host, 0)).toEqual({ status: 'unsupported', hint: WINDOWS_HINT })
})

test('busctl: playing, then Spotify closes (non-zero exit is closed, not a failure), then reopens', async () => {
  const f = fakeHost({ runs: { [BUS]: { exitCode: 0, stdout: PLAYING } } })
  const r = new MusicReader('busctl', 'linux')
  expect((await r.read(f.host, 0)).status).toBe('open')
  expect(f.timeouts.at(-1)).toBe(2000)
  const closed = fakeHost()
  expect(await r.read(closed.host, 1)).toEqual({ status: 'closed' })
  expect((await r.read(f.host, 2)).status).toBe('open')
})

test('one failed read keeps the last state, two clear it, a good read resets the count', async () => {
  const good = fakeHost({ runs: { [BUS]: { exitCode: 0, stdout: PLAYING } } }).host
  const junk = fakeHost({ runs: { [BUS]: { exitCode: 0, stdout: 'junk' } } }).host
  const hang: Host = { ...good, run: async () => { throw new Error('timed out') } }
  const r = new MusicReader('busctl', 'linux')
  const first = await r.read(good, 0)
  expect(await r.read(hang, 1)).toEqual(first)
  expect(await r.read(junk, 2)).toEqual({ status: 'closed' })
  await r.read(good, 3)
  expect((await r.read(hang, 4)).status).toBe('open')
})

test('controls run the backend command with the 2 s timeout', async () => {
  const f = fakeHost()
  await new MusicReader('busctl', 'linux').control(f.host, { cmd: 'playpause' })
  await new MusicReader('playerctl', 'linux').control(f.host, { cmd: 'next' })
  await new MusicReader('osascript', 'mac').control(f.host, { cmd: 'previous' })
  expect(f.ran).toEqual([
    'busctl --user call org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player PlayPause',
    'playerctl --player=spotify next',
    'osascript -e if application "Spotify" is running then run script "tell application \\"Spotify\\" to previous track"',
  ])
  expect(f.timeouts).toEqual([2000, 2000, 2000])
})

test('osascript control argv for each command runs the tell only inside the guarded run script', async () => {
  for (const [cmd, verb] of [['playpause', 'playpause'], ['next', 'next track'], ['previous', 'previous track']] as const) {
    const f = fakeHost()
    await new MusicReader('osascript', 'mac').control(f.host, { cmd })
    expect(f.ran).toEqual([`osascript -e if application "Spotify" is running then run script "tell application \\"Spotify\\" to ${verb}"`])
  }
})

test('osascript read script checks is running before any tell, and the tell is compiled only by run script', async () => {
  const f = fakeHost()
  await new MusicReader('osascript', 'mac').read(f.host, 0)
  const script = f.ran[0]!
  const running = script.indexOf('is running'), run = script.indexOf('run script')
  expect(running).toBeGreaterThan(-1)
  expect(running).toBeLessThan(run)
  expect(run).toBeLessThan(script.indexOf('tell application'))
  // the only tell sits inside the quoted run script argument
  expect(script.slice(0, run)).not.toContain('tell application')
  expect(script).toContain('on error')
})

test('osascript: a non-zero exit is a failed read, not closed', async () => {
  const good = fakeHost({ runs: {} }).host
  const ok: Host = { ...good, run: async () => ({ exitCode: 0, stdout: ['playing', 'id', 'T', 'A', 'B', '1000', '1.0'].join('\t') }) as never }
  const bad: Host = { ...good, run: async () => ({ exitCode: 1, stdout: '' }) as never }
  const r = new MusicReader('osascript', 'mac')
  const first = await r.read(ok, 0)
  expect(first.status).toBe('open')
  expect(await r.read(bad, 1)).toEqual(first)
  expect(await r.read(bad, 2)).toEqual({ status: 'closed' })
})
