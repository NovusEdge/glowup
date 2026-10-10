import { test, expect } from 'claude-code/testing'
import { parseBusctl, parsePlayerctl, parseOsascript, progressAt, sameMusic, type OpenMusic } from '../hooks/music/parse.ts'

// Captured from Spotify 1.2 on Linux, 2026-10-10.
const BUSCTL = [
  '{"type":"s","data":"Paused"}',
  '{"type":"a{sv}","data":{"mpris:trackid":{"type":"s","data":"/com/spotify/track/6UTrz4vab86upECRgbEMbM"},"mpris:length":{"type":"t","data":176959000},"mpris:artUrl":{"type":"s","data":"https://i.scdn.co/image/ab67616d0000b273e2c785ae4a47a8770589db72"},"xesam:album":{"type":"s","data":"uhhh 3"},"xesam:albumArtist":{"type":"as","data":["Khary"]},"xesam:artist":{"type":"as","data":["Khary"]},"xesam:autoRating":{"type":"d","data":2.800000000000000266454e-01},"xesam:discNumber":{"type":"i","data":1},"xesam:title":{"type":"s","data":"Fembrook Dr"},"xesam:trackNumber":{"type":"i","data":2},"xesam:url":{"type":"s","data":"https://open.spotify.com/track/6UTrz4vab86upECRgbEMbM"}}}',
  '{"type":"x","data":73827000}',
].join('\n')
const busctlWith = (status: string, meta: string, pos: number) =>
  [`{"type":"s","data":"${status}"}`, `{"type":"a{sv}","data":${meta}}`, `{"type":"x","data":${pos}}`].join('\n')

test('busctl: track, paused state and microseconds become ms', () => {
  expect(parseBusctl(BUSCTL, 5000)).toEqual({
    status: 'open', playing: false, ad: false, progressMs: 73827, readAt: 5000,
    track: { id: '/com/spotify/track/6UTrz4vab86upECRgbEMbM', title: 'Fembrook Dr', artist: 'Khary', album: 'uhhh 3', durationMs: 176959 },
  })
})

test('busctl: ads, several artists, missing album and zero length', () => {
  const ad = parseBusctl(busctlWith('Playing', '{"mpris:trackid":{"type":"s","data":"/com/spotify/ad/123"},"xesam:title":{"type":"s","data":"Spotify"}}', 0), 1)!
  expect(ad.ad).toBe(true)
  expect(ad.playing).toBe(true)
  const multi = parseBusctl(busctlWith('Playing', '{"mpris:trackid":{"type":"s","data":"/com/spotify/episode/9"},"xesam:artist":{"type":"as","data":["A","B"]},"xesam:title":{"type":"s","data":"Ep"}}', 10), 1)!
  expect(multi.track).toEqual({ id: '/com/spotify/episode/9', title: 'Ep', artist: 'A, B', album: '', durationMs: 0 })
  expect(multi.ad).toBe(false)
})

test('busctl: an empty Metadata is open with no track; junk is a failure', () => {
  expect(parseBusctl(busctlWith('Stopped', '{}', 0), 1)).toEqual({ status: 'open', playing: false, ad: false, progressMs: 0, readAt: 1 })
  expect(parseBusctl('not json', 1)).toBeUndefined()
  expect(parseBusctl('{"type":"s","data":"Playing"}', 1)).toBeUndefined()
})

test('playerctl: tab-separated format line', () => {
  const line = ['Playing', '/com/spotify/track/x', 'Song', 'Artist A, Artist B', 'Album', '200000000', '1500000'].join('\t')
  expect(parsePlayerctl(line + '\n', 9)).toEqual({
    status: 'open', playing: true, ad: false, progressMs: 1500, readAt: 9,
    track: { id: '/com/spotify/track/x', title: 'Song', artist: 'Artist A, Artist B', album: 'Album', durationMs: 200000 },
  })
  expect(parsePlayerctl('garbage', 9)).toBeUndefined()
})

test('osascript: running, closed, and a comma-decimal position', () => {
  const line = ['playing', 'spotify:track:abc', 'Song', 'Artist', 'Album', '200000', '73,8'].join('\t')
  expect(parseOsascript(line, 2)).toEqual({
    status: 'open', playing: true, ad: false, progressMs: 73800, readAt: 2,
    track: { id: 'spotify:track:abc', title: 'Song', artist: 'Artist', album: 'Album', durationMs: 200000 },
  })
  expect(parseOsascript('closed\n', 2)).toEqual({ status: 'closed' })
  expect((parseOsascript(['playing', 'spotify:ad:1', '', '', '', '30000', '1.0'].join('\t'), 2) as OpenMusic).ad).toBe(true)
  expect(parseOsascript('', 2)).toBeUndefined()
})

test('progress runs on while playing, holds while paused, stops at the end', () => {
  const m: OpenMusic = { status: 'open', playing: true, ad: false, progressMs: 1000, readAt: 0, track: { id: 'x', title: 't', artist: 'a', album: '', durationMs: 5000 } }
  expect(progressAt(m, 1500)).toBe(2500)
  expect(progressAt(m, 99999)).toBe(5000)
  expect(progressAt({ ...m, playing: false }, 1500)).toBe(1000)
  expect(progressAt({ ...m, track: { ...m.track!, durationMs: 0 } }, 1500)).toBe(2500)
})

test('sameMusic ignores progress that matches the clock, notices a seek', () => {
  const a: OpenMusic = { status: 'open', playing: true, ad: false, progressMs: 1000, readAt: 0, track: { id: 'x', title: 't', artist: 'a', album: '', durationMs: 9000 } }
  expect(sameMusic(a, { ...a, progressMs: 3000, readAt: 2000 }, 2000)).toBe(true)
  expect(sameMusic(a, { ...a, progressMs: 7000, readAt: 2000 }, 2000)).toBe(false)
  expect(sameMusic(a, { ...a, playing: false }, 0)).toBe(false)
  expect(sameMusic(a, { status: 'closed' }, 0)).toBe(false)
  expect(sameMusic({ status: 'closed' }, { status: 'closed' }, 0)).toBe(true)
  expect(sameMusic(undefined, { status: 'closed' }, 0)).toBe(false)
})
