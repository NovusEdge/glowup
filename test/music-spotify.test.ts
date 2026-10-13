import { expect } from 'claude-code/testing'
import { fakeHost, test, type FakeRequest } from './kit.ts'
import { SpotifyClient, readPlayer } from '../hooks/music/spotify.ts'
import { TokenKeeper, tokenFile, type Refresher } from '../hooks/music/tokens.ts'
import { commandRequest } from '../hooks/music/webapi.ts'

const PATH = tokenFile('/home/u/.claude')
const file = (over: Record<string, unknown> = {}) => JSON.stringify({ format: 1, clientId: 'c'.repeat(32), accessToken: 'at-1', refreshToken: 'rt-1', expiresAt: 3_600_000, scope: '', connectedAt: 0, gen: 1, ...over })
const PLAYER = JSON.stringify({ device: { id: 'p', name: 'Pixel 9', type: 'Smartphone' }, is_playing: true, progress_ms: 1000, currently_playing_type: 'track', item: { type: 'track', uri: 'spotify:track:t', name: 'T', duration_ms: 9000, artists: [], album: { name: '' } } })
type Reply = { status: number; text?: string; headers?: Record<string, string> }

async function rig(reply: (req: FakeRequest) => Reply | Promise<Reply>, refresh: (files: Record<string, string>) => Refresher = () => async () => 0) {
  let now = 1000
  const kit = fakeHost({ files: { [PATH]: file() }, http: async req => { const r = await reply(req); return { status: r.status, text: r.text ?? '', headers: r.headers ?? {} } } })
  const keeper = new TokenKeeper(kit.host, PATH, refresh(kit.files))
  await keeper.load()
  return { ...kit, keeper, client: new SpotifyClient(kit.host, keeper, () => now), at: (t: number) => { now = t } }
}
const tick = () => new Promise<void>(res => { setTimeout(res, 0) })
const auth =(reqs: FakeRequest[]) => reqs.map(r => r.headers.Authorization)

test('a read carries the bearer token and is dated when the answer arrived', async () => {
  const r = await rig(() => ({ status: 200, text: PLAYER }))
  expect(await readPlayer(r.client)).toMatchObject({ ok: true, at: 1000, music: { readAt: 1000, source: 'api', track: { title: 'T' } } })
  expect(auth(r.requests)).toEqual(['Bearer at-1'])
})

test('204 is nothing active, not an error', async () => {
  const r = await rig(() => ({ status: 204 }))
  expect(await readPlayer(r.client)).toEqual({ ok: true, at: 1000 })
})

test('a 401 refreshes once and retries; a second 401 means Reconnect', async () => {
  const fresh = (files: Record<string, string>): Refresher => async gen => { files[PATH] = file({ accessToken: 'at-2', gen: gen + 1 }); return 0 }
  const once = await rig(req => (req.headers.Authorization === 'Bearer at-2' ? { status: 200, text: PLAYER } : { status: 401 }), fresh)
  expect((await readPlayer(once.client)).ok).toBe(true)
  expect(auth(once.requests)).toEqual(['Bearer at-1', 'Bearer at-2'])
  const twice = await rig(() => ({ status: 401 }), fresh)
  expect(await readPlayer(twice.client)).toEqual({ ok: false, error: { kind: 'reconnect' } })
  expect(twice.keeper.status()).toBe('reconnect')
})

test('429 waits for Retry-After before anything goes out again', async () => {
  const r = await rig(() => ({ status: 429, headers: { 'retry-after': '7' } }))
  expect(await readPlayer(r.client)).toEqual({ ok: false, error: { kind: 'rate', untilMs: 8000 } })
  r.at(7999)
  expect(await readPlayer(r.client)).toEqual({ ok: false, error: { kind: 'rate', untilMs: 8000 } })
  expect(r.requests).toHaveLength(1)
  r.at(8000)
  await readPlayer(r.client)
  expect(r.requests).toHaveLength(2)
})

test('a request still out blocks a second one to the same endpoint, not to another', async () => {
  let open = () => {}
  const gate = new Promise<void>(res => { open = res })
  const r = await rig(async req => { if (req.url.includes('/me/player?')) await gate; return { status: 200, text: req.url.includes('/me/player?') ? PLAYER : '{}' } })
  const first = readPlayer(r.client)
  expect(await readPlayer(r.client)).toEqual({ ok: false, error: { kind: 'busy' } })
  expect((await r.client.send({ method: 'GET', url: 'https://api.spotify.com/v1/me' })).ok).toBe(true)
  open()
  expect((await first).ok).toBe(true)
  expect((await readPlayer(r.client)).ok).toBe(true)
})

test('a network error is offline, and the next read goes out', async () => {
  const r = await rig(() => { throw new Error('ECONNRESET') })
  expect(await readPlayer(r.client)).toEqual({ ok: false, error: { kind: 'offline' } })
  expect(await readPlayer(r.client)).toEqual({ ok: false, error: { kind: 'offline' } })
  expect(r.requests).toHaveLength(2)
})

test('an endpoint stays busy after the 5 s offline until the engine request settles', async () => {
  let open = () => {}
  const gate = new Promise<void>(res => { open = res })
  const r = await rig(async () => { await gate; return { status: 200, text: PLAYER } })
  const first = readPlayer(r.client)
  await tick()
  r.expire()
  expect(await first).toEqual({ ok: false, error: { kind: 'offline' } })
  expect(await readPlayer(r.client)).toEqual({ ok: false, error: { kind: 'busy' } })
  expect(r.requests).toHaveLength(1)
  open()
  await tick()
  expect((await readPlayer(r.client)).ok).toBe(true)
  expect(r.requests).toHaveLength(2)
})

test('PREMIUM_REQUIRED turns premium off; another 403 does not', async () => {
  const reason = (s: string) => JSON.stringify({ error: { status: 403, message: 'x', reason: s } })
  const r = await rig(req => ({ status: 403, text: reason(req.url.endsWith('/next') ? 'PREMIUM_REQUIRED' : 'UNKNOWN') }))
  expect(await r.client.send(commandRequest({ cmd: 'seek', ms: 1 }, true)!)).toEqual({ ok: false, error: { kind: 'refused', reason: 'UNKNOWN' } })
  expect(r.client.premium).toBe(true)
  expect(await r.client.send(commandRequest({ cmd: 'next' }, true)!)).toEqual({ ok: false, error: { kind: 'premium' } })
  expect(r.client.premium).toBe(false)
})
