import type { Host } from '../host.ts'
import { LOOP_STATUS, OSA_READ, PLAYERCTL_EXTRAS_FORMAT, PLAYERCTL_FORMAT, osaGuarded, parseBusctl, parseBusctlExtras, parseOsascript, parsePlayerctl, parsePlayerctlExtras, type Music, type MusicCmd, type Repeat } from './parse.ts'

export type Platform = 'linux' | 'mac' | 'windows'
export type Backend = 'busctl' | 'playerctl' | 'osascript'
export type MusicCaps = { repeat: Repeat[]; shuffle: boolean; raise: boolean }
export const LINUX_HINT = 'Spotify needs busctl (systemd) or playerctl to show here.'
export const WINDOWS_HINT = 'Spotify shows here on Linux and macOS.'
const RUN_MS = 2000

const BUS_NAME = 'org.mpris.MediaPlayer2.spotify', BUS_PATH = '/org/mpris/MediaPlayer2'
const DEST = [BUS_NAME, BUS_PATH, 'org.mpris.MediaPlayer2.Player']
const BUS_READ = ['busctl', '--user', '--json=short', 'get-property', ...DEST, 'PlaybackStatus', 'Metadata', 'Position']
// get-property fails as a whole when one property is missing, so these are a second call the track does not depend on
export const BUS_EXTRAS = ['busctl', '--user', '--json=short', 'get-property', ...DEST, 'Shuffle', 'LoopStatus', 'Volume']
const PCTL = ['playerctl', '--player=spotify']
export const PCTL_EXTRAS = [...PCTL, 'metadata', '--format', PLAYERCTL_EXTRAS_FORMAT]
const BUS_CMD = { playpause: 'PlayPause', next: 'Next', previous: 'Previous' } as const
const PCTL_CMD = { playpause: 'play-pause', next: 'next', previous: 'previous' } as const
const OSA_CMD = { playpause: 'playpause', next: 'next track', previous: 'previous track' } as const

const works = (host: Host, argv: string[]) => host.run(argv, undefined, RUN_MS).then(r => r.exitCode === 0, () => false)
const secs = (ms: number) => (Math.max(0, ms) / 1000).toFixed(3)
const unit = (v: number) => Math.min(1, Math.max(0, v))

export async function pickBackend(host: Host, platform: Platform): Promise<Backend | undefined> {
  if (platform === 'mac') return 'osascript'
  if (platform === 'windows') return undefined
  // busctl --json needs systemd 240; older builds pass a plain --version but fail every read.
  if (await works(host, ['busctl', '--json=short', '--version'])) return 'busctl'
  if (await works(host, ['playerctl', '--version'])) return 'playerctl'
  return undefined
}

export class MusicReader {
  private fails = 0
  private last: Music = { status: 'closed' }
  constructor(private backend: Backend | undefined, private platform: Platform) {}

  async read(host: Host, now: number): Promise<Music> {
    if (!this.backend) return { status: 'unsupported', hint: this.platform === 'windows' ? WINDOWS_HINT : LINUX_HINT }
    let got: Music | undefined
    try { got = await this.once(host, now) } catch { got = undefined }
    if (got) { this.fails = 0; this.last = got; return got }
    // one slow or garbled read is noise; two in a row means the player is gone
    if (++this.fails >= 2) this.last = { status: 'closed' }
    return this.last
  }

  // undefined is a failed read; a closed player is a successful read of 'closed'
  private async once(host: Host, now: number): Promise<Music | undefined> {
    if (this.backend === 'busctl') {
      const r = await host.run(BUS_READ, undefined, RUN_MS)
      if (r.exitCode !== 0) return { status: 'closed' }
      const m = parseBusctl(r.stdout, now)
      if (!m) return undefined
      const x = await host.run(BUS_EXTRAS, undefined, RUN_MS).catch(() => undefined)
      return { ...m, ...(x?.exitCode === 0 ? parseBusctlExtras(x.stdout) : undefined) }
    }
    if (this.backend === 'playerctl') {
      const r = await host.run([...PCTL, 'metadata', '--format', PLAYERCTL_FORMAT], undefined, RUN_MS)
      if (r.exitCode !== 0) return { status: 'closed' }
      const m = parsePlayerctl(r.stdout, now)
      if (!m) return undefined
      const x = await host.run(PCTL_EXTRAS, undefined, RUN_MS).catch(() => undefined)
      return { ...m, ...(x?.exitCode === 0 ? parsePlayerctlExtras(x.stdout) : undefined) }
    }
    const r = await host.run(['osascript', '-e', OSA_READ], undefined, RUN_MS)
    return r.exitCode !== 0 ? undefined : parseOsascript(r.stdout, now)
  }

  caps(): MusicCaps {
    // Spotify's Linux client ignores LoopStatus and Shuffle-on writes over MPRIS, so busctl and playerctl offer neither.
    const mac = this.backend === 'osascript'
    return { repeat: mac ? ['off', 'context'] : [], shuffle: mac, raise: this.backend === 'busctl' || this.backend === 'osascript' }
  }

  // MPRIS SetPosition names the track it seeks in; it is the one the last read saw.
  private trackId(): string | undefined {
    return this.last.status === 'open' ? this.last.track?.id : undefined
  }

  argvFor(c: MusicCmd): string[] | undefined {
    if (this.backend === 'busctl') {
      const set = (prop: string, sig: string, v: string) => ['busctl', '--user', 'set-property', ...DEST, prop, sig, v]
      switch (c.cmd) {
        case 'playpause': case 'next': case 'previous': return ['busctl', '--user', 'call', ...DEST, BUS_CMD[c.cmd]]
        case 'raise': return ['busctl', '--user', 'call', BUS_NAME, BUS_PATH, 'org.mpris.MediaPlayer2', 'Raise']
        case 'seek': { const id = this.trackId(); return id?.startsWith('/') ? ['busctl', '--user', 'call', ...DEST, 'SetPosition', 'ox', id, String(Math.round(Math.max(0, c.ms) * 1000))] : undefined }
        case 'shuffle': return set('Shuffle', 'b', String(c.on))
        case 'repeat': return set('LoopStatus', 's', LOOP_STATUS[c.mode])
        case 'volume': return set('Volume', 'd', unit(c.level).toFixed(2))
      }
    }
    if (this.backend === 'playerctl') {
      switch (c.cmd) {
        case 'playpause': case 'next': case 'previous': return [...PCTL, PCTL_CMD[c.cmd]]
        case 'raise': return undefined
        case 'seek': return [...PCTL, 'position', secs(c.ms)]
        case 'shuffle': return [...PCTL, 'shuffle', c.on ? 'On' : 'Off']
        case 'repeat': return [...PCTL, 'loop', LOOP_STATUS[c.mode]]
        case 'volume': return [...PCTL, 'volume', unit(c.level).toFixed(2)]
      }
    }
    if (this.backend === 'osascript') {
      const verb = c.cmd === 'playpause' || c.cmd === 'next' || c.cmd === 'previous' ? OSA_CMD[c.cmd]
        : c.cmd === 'raise' ? 'activate'
        : c.cmd === 'seek' ? `set player position to ${secs(c.ms)}`
        : c.cmd === 'shuffle' ? `set shuffling to ${c.on}`
        : c.cmd === 'repeat' ? `set repeating to ${c.mode !== 'off'}`
        : c.cmd === 'volume' ? `set sound volume to ${Math.round(unit(c.level) * 100)}`
        : undefined
      if (!verb) return undefined
      return ['osascript', '-e', `if application "Spotify" is running then run script ${osaGuarded(`tell application "Spotify" to ${verb}`)}`]
    }
    return undefined
  }

  async control(host: Host, cmd: MusicCmd): Promise<void> {
    const argv = this.argvFor(cmd)
    if (argv) await host.run(argv, undefined, RUN_MS).catch(() => undefined)
  }
}
