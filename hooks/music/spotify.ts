// The Web API client: the bearer token, one refresh and retry on a 401, Retry-After, and one request per endpoint in flight.
import type { Host } from '../host.ts'
import type { OpenMusic } from './parse.ts'
import type { TokenKeeper } from './tokens.ts'
import { apiError, parsePlayer, playerRequest, type ApiError, type ApiRequest } from './webapi.ts'

export const API_TIMEOUT_MS = 5000
export type ApiAnswer = { ok: true; status: number; text: string; at: number } | { ok: false; error: ApiError }

export class SpotifyClient {
  private inFlight = new Set<string>()
  private until = 0
  // false once a write answered PREMIUM_REQUIRED: transport then goes through the local app for the session
  premium = true
  constructor(private host: Host, private keeper: TokenKeeper, private now: () => number) {}

  async send(r: ApiRequest): Promise<ApiAnswer> {
    if (this.now() < this.until) return { ok: false, error: { kind: 'rate', untilMs: this.until } }
    // keyed without the query: the engine request cannot be aborted, so a hung one blocks the next poll of its endpoint instead of piling another on
    const key = `${r.method} ${r.url.split('?')[0]}`
    if (this.inFlight.has(key)) return { ok: false, error: { kind: 'busy' } }
    this.inFlight.add(key)
    try { return await this.authorized(r) } finally { this.inFlight.delete(key) }
  }

  private async authorized(r: ApiRequest): Promise<ApiAnswer> {
    const first = await this.keeper.access(this.now())
    if ('error' in first) return { ok: false, error: first.error === 'failed' ? { kind: 'offline' } : { kind: 'reconnect' } }
    let res = await this.fetch(r, first.token)
    if (res?.status === 401) {
      const again = await this.keeper.access(this.now(), first.token)
      if ('error' in again) return { ok: false, error: again.error === 'failed' ? { kind: 'offline' } : { kind: 'reconnect' } }
      res = await this.fetch(r, again.token)
    }
    if (!res) return { ok: false, error: { kind: 'offline' } }
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, text: res.text, at: this.now() }
    const error = apiError(res.status, res.text, res.headers, this.now())
    if (error.kind === 'rate') this.until = error.untilMs
    if (error.kind === 'premium') this.premium = false
    if (error.kind === 'reconnect') this.keeper.lost()
    return { ok: false, error }
  }

  private fetch(r: ApiRequest, token: string) {
    return this.host.fetch(r.url, { method: r.method, headers: { Authorization: `Bearer ${token}` }, timeoutMs: API_TIMEOUT_MS }).catch(() => undefined)
  }
}

// music absent is a 204: nothing is active on any device.
export type PlayerRead = { ok: true; at: number; music?: OpenMusic } | { ok: false; error: ApiError }
export async function readPlayer(c: SpotifyClient): Promise<PlayerRead> {
  const a = await c.send(playerRequest())
  if (!a.ok) return a
  if (a.status === 204 || !a.text.trim()) return { ok: true, at: a.at }
  const music = parsePlayer(a.text, a.at)
  return music ? { ok: true, at: a.at, music } : { ok: false, error: { kind: 'server', status: a.status } }
}
