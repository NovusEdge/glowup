import { test, expect } from 'claude-code/testing'
import { apiError, commandRequest, likedRequest, likeRequest, meRequest, needsRefresh, parseLiked, parseMe, parsePlayer, parseQueue, playerRequest, queueRequest } from '../hooks/music/webapi.ts'

// Recorded shapes of the Web API's answers, trimmed to the fields glowup reads.
const ITEM = {
  type: 'track', id: 'tid', uri: 'spotify:track:tid', name: 'BACK 2 THE BASICS', duration_ms: 174000,
  artists: [{ name: 'Double A-Ron' }, { name: 'Guest' }],
  album: { name: 'Commercial Break 2', images: [
    { url: 'https://i.scdn.co/image/ab67616d0000b273aa', width: 640, height: 640 },
    { url: 'https://i.scdn.co/image/ab67616d00004851aa', width: 64, height: 64 },
    { url: 'https://i.scdn.co/image/ab67616d00001e02aa', width: 300, height: 300 },
  ] },
  external_urls: { spotify: 'https://open.spotify.com/track/tid' },
}
const EPISODE = { type: 'episode', uri: 'spotify:episode:eid', name: 'Ep 12', duration_ms: 3_600_000, show: { name: 'The Show' }, images: [{ url: 'https://i.scdn.co/image/ep64', width: 64, height: 64 }], external_urls: { spotify: 'https://open.spotify.com/episode/eid' } }
const PHONE = { id: 'dev-phone', is_active: true, name: 'Pixel 9', type: 'Smartphone', volume_percent: 40, supports_volume: true }
const DESK = { id: 'dev-desk', is_active: true, name: 'Desktop', type: 'Computer', volume_percent: 100, supports_volume: true }
const player = (over: object) => JSON.stringify({ device: PHONE, shuffle_state: true, repeat_state: 'context', timestamp: 1, progress_ms: 61000, is_playing: true, currently_playing_type: 'track', item: ITEM, ...over })

test('a track on a phone parses to the shared shape, with the smallest cover', () => {
  expect(parsePlayer(player({}), 500)).toEqual({
    status: 'open', playing: true, ad: false, progressMs: 61000, readAt: 500, source: 'api', shuffle: true, repeat: 'context', volume: 0.4,
    device: { id: 'dev-phone', name: 'Pixel 9', type: 'Smartphone', isThisComputer: false },
    track: { id: 'spotify:track:tid', title: 'BACK 2 THE BASICS', artist: 'Double A-Ron, Guest', album: 'Commercial Break 2', durationMs: 174000, uri: 'spotify:track:tid', artUrl: 'https://i.scdn.co/image/ab67616d00004851aa', url: 'https://open.spotify.com/track/tid' },
  })
})

test('an episode, an ad, and answers that are not a player', () => {
  const ep = parsePlayer(player({ device: DESK, is_playing: false, currently_playing_type: 'episode', item: EPISODE, repeat_state: 'off', shuffle_state: false }), 0)!
  expect(ep.track).toEqual({ id: 'spotify:episode:eid', title: 'Ep 12', artist: 'The Show', album: '', durationMs: 3_600_000, uri: 'spotify:episode:eid', artUrl: 'https://i.scdn.co/image/ep64', url: 'https://open.spotify.com/episode/eid' })
  expect([ep.playing, ep.repeat, ep.shuffle, ep.volume]).toEqual([false, 'off', false, 1])
  const ad = parsePlayer(player({ currently_playing_type: 'ad', item: null }), 0)!
  expect([ad.ad, ad.track]).toEqual([true, undefined])
  expect(parsePlayer('', 0)).toBeUndefined()
  expect(parsePlayer('null', 0)).toBeUndefined()
  expect(parsePlayer(player({ device: { ...PHONE, supports_volume: false } }), 0)!.volume).toBeUndefined()
})

test('the queue, the library and the account', () => {
  expect(parseQueue(JSON.stringify({ currently_playing: ITEM, queue: [{ ...ITEM, uri: 'spotify:track:n', name: 'Next' }, EPISODE, null] }))).toEqual([
    { uri: 'spotify:track:n', title: 'Next', artist: 'Double A-Ron, Guest', durationMs: 174000 },
    { uri: 'spotify:episode:eid', title: 'Ep 12', artist: 'The Show', durationMs: 3_600_000 },
  ])
  expect(parseQueue('{}')).toBeUndefined()
  expect([parseLiked('[true]'), parseLiked('[false]'), parseLiked('{}')]).toEqual([true, false, undefined])
  expect([parseMe('{"display_name":"Ada","id":"ada1"}'), parseMe('{"display_name":null,"id":"ada1"}'), parseMe('[]')]).toEqual(['Ada', 'ada1', undefined])
})

test('the requests: episodes asked for, the library by URI, and never /me/tracks', () => {
  expect(playerRequest()).toEqual({ method: 'GET', url: 'https://api.spotify.com/v1/me/player?additional_types=episode' })
  expect(queueRequest()).toEqual({ method: 'GET', url: 'https://api.spotify.com/v1/me/player/queue?additional_types=episode' })
  expect(meRequest()).toEqual({ method: 'GET', url: 'https://api.spotify.com/v1/me' })
  expect(likedRequest('spotify:track:tid')).toEqual({ method: 'GET', url: 'https://api.spotify.com/v1/me/library/contains?uris=spotify%3Atrack%3Atid' })
  expect(likeRequest('spotify:track:tid', true)).toEqual({ method: 'PUT', url: 'https://api.spotify.com/v1/me/library?uris=spotify%3Atrack%3Atid' })
  expect(likeRequest('spotify:track:tid', false).method).toBe('DELETE')
  const all = [playerRequest(), queueRequest(), meRequest(), likedRequest('spotify:track:x'), likeRequest('spotify:track:x', true)]
  expect(JSON.stringify(all)).not.toContain('/me/tracks')
})

test('a transport command is one write', () => {
  const at = (c: Parameters<typeof commandRequest>[0], playing = true) => commandRequest(c, playing)
  expect(at({ cmd: 'playpause' })).toEqual({ method: 'PUT', url: 'https://api.spotify.com/v1/me/player/pause' })
  expect(at({ cmd: 'playpause' }, false)).toEqual({ method: 'PUT', url: 'https://api.spotify.com/v1/me/player/play' })
  expect(at({ cmd: 'next' })).toEqual({ method: 'POST', url: 'https://api.spotify.com/v1/me/player/next' })
  expect(at({ cmd: 'previous' })).toEqual({ method: 'POST', url: 'https://api.spotify.com/v1/me/player/previous' })
  expect(at({ cmd: 'seek', ms: 61234.4 })!.url).toBe('https://api.spotify.com/v1/me/player/seek?position_ms=61234')
  expect(at({ cmd: 'shuffle', on: false })!.url).toBe('https://api.spotify.com/v1/me/player/shuffle?state=false')
  expect(at({ cmd: 'repeat', mode: 'track' })!.url).toBe('https://api.spotify.com/v1/me/player/repeat?state=track')
  expect(at({ cmd: 'volume', level: 0.456 })!.url).toBe('https://api.spotify.com/v1/me/player/volume?volume_percent=46')
  expect([at({ cmd: 'raise' }), at({ cmd: 'like', on: true })]).toEqual([undefined, undefined])
})

test('errors by status and Spotify reason', () => {
  const body = (reason: string) => JSON.stringify({ error: { status: 403, message: 'x', reason } })
  expect(apiError(429, '', { 'retry-after': '7' }, 1000)).toEqual({ kind: 'rate', untilMs: 8000 })
  expect(apiError(429, '', {}, 1000)).toEqual({ kind: 'rate', untilMs: 6000 })
  expect(apiError(503, '', {}, 0)).toEqual({ kind: 'server', status: 503 })
  expect(apiError(401, '', {}, 0)).toEqual({ kind: 'reconnect' })
  expect(apiError(403, body('PREMIUM_REQUIRED'), {}, 0)).toEqual({ kind: 'premium' })
  expect(apiError(403, body('UNKNOWN'), {}, 0)).toEqual({ kind: 'refused', reason: 'UNKNOWN' })
  expect(apiError(403, '', {}, 0)).toEqual({ kind: 'refused', reason: '403' })
  expect(apiError(404, JSON.stringify({ error: { status: 404, reason: 'NO_ACTIVE_DEVICE' } }), {}, 0)).toEqual({ kind: 'noDevice' })
})

test('a token is refreshed in its last minute', () => {
  expect(needsRefresh(100_000, 40_001)).toBe(true)
  expect(needsRefresh(100_000, 40_000)).toBe(false)
})
