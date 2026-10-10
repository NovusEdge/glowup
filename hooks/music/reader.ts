import type { Host } from '../host.ts'
import { OSA_READ, PLAYERCTL_FORMAT, parseBusctl, parseOsascript, parsePlayerctl, type Music, type MusicCmd } from './parse.ts'

export type Platform = 'linux' | 'mac' | 'windows'
export type Backend = 'busctl' | 'playerctl' | 'osascript'
export const LINUX_HINT = 'Spotify needs busctl (systemd) or playerctl to show here.'
export const WINDOWS_HINT = 'Spotify shows here on Linux and macOS.'
const RUN_MS = 2000

const DEST = ['org.mpris.MediaPlayer2.spotify', '/org/mpris/MediaPlayer2', 'org.mpris.MediaPlayer2.Player']
const BUS_READ = ['busctl', '--user', '--json=short', 'get-property', ...DEST, 'PlaybackStatus', 'Metadata', 'Position']
const BUS_CMD: Record<MusicCmd, string> = { playpause: 'PlayPause', next: 'Next', previous: 'Previous' }
const PCTL_CMD: Record<MusicCmd, string> = { playpause: 'play-pause', next: 'next', previous: 'previous' }
// `tell` without the guard would launch Spotify to answer.
const OSA_CMD: Record<MusicCmd, string> = { playpause: 'playpause', next: 'next track', previous: 'previous track' }

const works = (host: Host, argv: string[]) => host.run(argv, undefined, RUN_MS).then(r => r.exitCode === 0, () => false)

export async function pickBackend(host: Host, platform: Platform): Promise<Backend | undefined> {
  if (platform === 'mac') return 'osascript'
  if (platform === 'windows') return undefined
  if (await works(host, ['busctl', '--version'])) return 'busctl'
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
      return r.exitCode !== 0 ? { status: 'closed' } : parseBusctl(r.stdout, now)
    }
    if (this.backend === 'playerctl') {
      const r = await host.run(['playerctl', '--player=spotify', 'metadata', '--format', PLAYERCTL_FORMAT], undefined, RUN_MS)
      return r.exitCode !== 0 ? { status: 'closed' } : parsePlayerctl(r.stdout, now)
    }
    const r = await host.run(['osascript', '-e', OSA_READ], undefined, RUN_MS)
    return r.exitCode !== 0 ? undefined : parseOsascript(r.stdout, now)
  }

  async control(host: Host, cmd: MusicCmd): Promise<void> {
    const argv = this.backend === 'busctl' ? ['busctl', '--user', 'call', ...DEST, BUS_CMD[cmd]]
      : this.backend === 'playerctl' ? ['playerctl', '--player=spotify', PCTL_CMD[cmd]]
      : this.backend === 'osascript' ? ['osascript', '-e', `if application "Spotify" is running then tell application "Spotify" to ${OSA_CMD[cmd]}`]
      : undefined
    if (argv) await host.run(argv, undefined, RUN_MS).catch(() => undefined)
  }
}
