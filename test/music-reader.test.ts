import { test, expect } from 'claude-code/testing'
import { fakeHost } from './kit.ts'
import { MusicReader, pickBackend, LINUX_HINT, WINDOWS_HINT } from '../hooks/music/reader.ts'
import type { Host } from '../hooks/host.ts'

const BUS = 'busctl --user --json=short get-property org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player PlaybackStatus Metadata Position'
const PLAYING = ['{"type":"s","data":"Playing"}', '{"type":"a{sv}","data":{"mpris:trackid":{"type":"s","data":"/com/spotify/track/t"},"xesam:title":{"type":"s","data":"S"},"mpris:length":{"type":"t","data":9000000}}}', '{"type":"x","data":1000000}'].join('\n')

test('backend: busctl first, then playerctl, osascript on mac, none on windows', async () => {
  expect(await pickBackend(fakeHost({ runs: { 'busctl --version': { exitCode: 0, stdout: 'systemd 258' } } }).host, 'linux')).toBe('busctl')
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
  await new MusicReader('busctl', 'linux').control(f.host, 'playpause')
  await new MusicReader('playerctl', 'linux').control(f.host, 'next')
  await new MusicReader('osascript', 'mac').control(f.host, 'previous')
  expect(f.ran).toEqual([
    'busctl --user call org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player PlayPause',
    'playerctl --player=spotify next',
    'osascript -e if application "Spotify" is running then tell application "Spotify" to previous track',
  ])
  expect(f.timeouts).toEqual([2000, 2000, 2000])
})

test('osascript read script checks is running before any tell', async () => {
  const f = fakeHost()
  await new MusicReader('osascript', 'mac').read(f.host, 0)
  const script = f.ran[0]!
  expect(script.indexOf('is running')).toBeGreaterThan(-1)
  expect(script.indexOf('is running')).toBeLessThan(script.indexOf('tell application'))
})
