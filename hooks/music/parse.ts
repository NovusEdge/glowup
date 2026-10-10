// JSX-free and engine-free: parsers only, so they test on recorded output.
export type Track = { id: string; title: string; artist: string; album: string; durationMs: number }
export type OpenMusic = { status: 'open'; track?: Track; playing: boolean; ad: boolean; progressMs: number; readAt: number }
export type Music = { status: 'closed' } | { status: 'unsupported'; hint: string } | OpenMusic
export type MusicCmd = 'playpause' | 'next' | 'previous'

const isAd = (id: string) => id.startsWith('/com/spotify/ad/') || id.startsWith('spotify:ad:')
// A seek shows up as a read that disagrees with the extrapolated position by more than this.
const SEEK_MS = 1500

function open(status: string, id: string, title: string, artist: string, album: string, durationMs: number, progressMs: number, readAt: number): OpenMusic {
  const base: OpenMusic = { status: 'open', playing: status.toLowerCase() === 'playing', ad: isAd(id), progressMs: Math.max(0, Math.round(progressMs)), readAt }
  return id || title ? { ...base, track: { id, title, artist, album, durationMs: Math.max(0, Math.round(durationMs)) } } : base
}

// busctl get-property with PlaybackStatus Metadata Position prints one JSON value per line; MPRIS times are µs.
export function parseBusctl(stdout: string, readAt: number): OpenMusic | undefined {
  const vals = stdout.trim().split('\n').map(l => { try { return JSON.parse(l) as { data?: unknown } } catch { return undefined } })
  if (vals.length !== 3 || vals.some(v => !v || typeof v !== 'object')) return undefined
  const [status, meta, pos] = vals as { data?: unknown }[]
  if (typeof status!.data !== 'string' || !meta!.data || typeof meta!.data !== 'object') return undefined
  const md = meta!.data as Record<string, { data?: unknown } | undefined>
  const str = (k: string) => (typeof md[k]?.data === 'string' ? md[k]!.data as string : '')
  const list = (k: string) => (Array.isArray(md[k]?.data) ? (md[k]!.data as unknown[]).filter(x => typeof x === 'string').join(', ') : str(k))
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return open(status!.data, str('mpris:trackid'), str('xesam:title'), list('xesam:artist'), str('xesam:album'), num(md['mpris:length']?.data) / 1000, num(pos!.data) / 1000, readAt)
}

export const PLAYERCTL_FORMAT = ['{{status}}', '{{mpris:trackid}}', '{{xesam:title}}', '{{xesam:artist}}', '{{xesam:album}}', '{{mpris:length}}', '{{position}}'].join('\t')

export function parsePlayerctl(stdout: string, readAt: number): OpenMusic | undefined {
  const f = stdout.replace(/\n$/, '').split('\t')
  if (f.length !== 7) return undefined
  return open(f[0]!, f[1]!, f[2]!, f[3]!, f[4]!, (Number(f[5]) || 0) / 1000, (Number(f[6]) || 0) / 1000, readAt)
}

// Spotify's duration is ms, its player position seconds; a comma-decimal locale prints "73,8".
export const OSA_READ = [
  'if application "Spotify" is running then',
  '  tell application "Spotify"',
  '    set t to current track',
  '    return (player state as string) & tab & (id of t) & tab & (name of t) & tab & (artist of t) & tab & (album of t) & tab & (duration of t) & tab & (player position as string)',
  '  end tell',
  'end if',
  'return "closed"',
].join('\n')

export function parseOsascript(stdout: string, readAt: number): Music | undefined {
  const s = stdout.replace(/\n$/, '')
  if (s === 'closed') return { status: 'closed' }
  const f = s.split('\t')
  if (f.length !== 7) return undefined
  return open(f[0]!, f[1]!, f[2]!, f[3]!, f[4]!, Number(f[5]) || 0, (Number(f[6]!.replace(',', '.')) || 0) * 1000, readAt)
}

export function progressAt(m: OpenMusic, now: number): number {
  const at = m.playing ? m.progressMs + Math.max(0, now - m.readAt) : m.progressMs
  const end = m.track?.durationMs ?? 0
  return end > 0 ? Math.min(at, end) : at
}

// True when a redraw would show nothing new: same state and track, and progress where the clock put it.
export function sameMusic(a: Music | undefined, b: Music, now: number): boolean {
  if (!a || a.status !== b.status) return false
  if (a.status === 'unsupported') return b.status === 'unsupported' && a.hint === b.hint
  if (a.status === 'closed' || b.status !== 'open') return true
  const o = a as OpenMusic
  return o.playing === b.playing && o.ad === b.ad && JSON.stringify(o.track) === JSON.stringify(b.track) && Math.abs(progressAt(o, now) - progressAt(b, now)) <= SEEK_MS
}
