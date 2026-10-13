// Which Spotify state to show and who runs a command, from the local read and the Web API's last answers.
// JSX-free and engine-free, so it tests on recorded states with any clock.
import { progressAt, SEEK_MS, type Music, type MusicCmd, type OpenMusic, type QueueItem, type Repeat } from './parse.ts'
import type { MusicCaps } from './reader.ts'

// What the API last said. liked and upNext are keyed by the track URI they were read for, so an answer about
// the last track never lands on this one; on or item absent marks a read that failed and is not tried again for it.
export type Link = {
  // the last good GET /me/player; music absent is a 204. localUri is the local app's track and intervalMs the poll
  // interval when it was read: a local read counts as a track change the API has not seen only if its URI differs
  // from localUri, and the read stays fresh for two of the slower of intervalMs and the interval now.
  last?: { at: number; music?: OpenMusic; localUri?: string; intervalMs?: number }
  liked?: { uri: string; on?: boolean }
  upNext?: { uri: string; item?: QueueItem }
}
export type Route = 'api' | 'apiThenLocal' | 'local' | 'none'
const ALL_REPEAT: Repeat[] = ['off', 'context', 'track']

export const apiDelay = (playing: boolean, shown: boolean) => (playing && shown ? 3000 : 15_000)

// link undefined is not connected, or Reconnect: the local read as before A3. intervalMs is the API's poll interval now.
export function mergeMusic(local: Music, link: Link | undefined, prev: Music | undefined, now: number, intervalMs: number): Music {
  if (!link) return local
  const last = link.last
  let out: Music
  if (!last || now - last.at > 2 * Math.max(intervalMs, last.intervalMs ?? 0)) out = local.status === 'open' ? { ...local, source: 'local' } : local
  else if (!last.music) out = local.status === 'open' ? { ...local, source: 'api' } : { status: 'open', playing: false, ad: false, progressMs: 0, readAt: now, source: 'api' }
  else {
    const api = last.music
    const uri = local.status === 'open' ? local.track?.uri : undefined
    // A local track other than the one local showed at the API read may be a change the API has not seen yet: local wins until the API reads again.
    const here = uri !== undefined && api.device?.type === 'Computer' && (api.track?.uri === uri || uri !== last.localUri)
    out = here
      ? { ...(local as OpenMusic), source: 'api', ...(api.shuffle !== undefined && { shuffle: api.shuffle }), ...(api.repeat && { repeat: api.repeat }), ...(api.volume !== undefined && { volume: api.volume }), device: { ...api.device!, isThisComputer: true } }
      : api
  }
  return keepProgress(withTrackFacts(out, link), prev, now)
}

function withTrackFacts(m: Music, link: Link): Music {
  if (m.status !== 'open' || m.source !== 'api' || !m.track?.uri) return m
  const uri = m.track.uri
  return { ...m, ...(link.liked?.uri === uri && link.liked.on !== undefined && { liked: link.liked.on }), ...(link.upNext?.uri === uri && link.upNext.item && { upNext: link.upNext.item }) }
}

// The bar for the same track never moves back unless the API itself reports it (a seek on another device): the local
// app can lag, or know nothing of a track playing elsewhere, and does so for as long as the API stays quiet.
function keepProgress(m: Music, prev: Music | undefined, now: number): Music {
  if (m.status !== 'open' || prev?.status !== 'open' || (m.source === 'api' && prev.source === 'api') || !m.track?.uri || m.track.uri !== prev.track?.uri) return m
  const was = progressAt(prev, now)
  return progressAt(m, now) < was - SEEK_MS ? { ...m, progressMs: Math.round(was), readAt: now } : m
}

// premium false: Spotify answered PREMIUM_REQUIRED once this session, so transport stays local.
export function routeOf(cmd: MusicCmd, m: Music | undefined, premium: boolean): Route {
  const o = m?.status === 'open' && m.source === 'api' && m.device ? m : undefined
  if (cmd.cmd === 'like') return o?.track?.uri ? 'api' : 'none'
  if (cmd.cmd === 'raise' || !o || !premium) return 'local'
  // the API can fail where the app on this computer still answers
  return o.device!.isThisComputer ? 'apiThenLocal' : 'api'
}

// While the API runs the player, shuffle, every repeat mode and volume work whatever the local app allows.
export function capsOf(m: Music | undefined, local: MusicCaps | undefined, premium: boolean): MusicCaps | undefined {
  const api = premium && m?.status === 'open' && m.source === 'api' && m.device !== undefined
  return api ? { repeat: ALL_REPEAT, shuffle: true, raise: local?.raise ?? false, volume: true } : local
}
