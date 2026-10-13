// The Music dialog's body. Engine-free: register.tsx resolves the elements and builds the Clients.
import type { Model } from './model.ts'
import type { Theme } from './themes.ts'
import { fit, renderSegs, type Seg } from './layout.tsx'
import { progressAt, type MusicCmd } from './music/parse.ts'
import { barRow, type SeekBarProps } from './music/seek.ts'
import { coverPlaceholder } from './music/art.ts'
import type { MusicCaps } from './music/reader.ts'
import { musicControls } from './pane.tsx'

export const PLAYER_ID = 'glowup-music'
// The dock grants about 88 columns and inline 13 to 20 rows, so these fit the grants seen, not the 110x24 asked for.
const LEFT_COLS = 30, SIDE_MIN = 80, GAP = 2
// On macOS the left column under a 20x10 cover needs about 20 rows: cover, gap, three track rows, the seek and
// volume bars, the controls margin and up to three wrapped button rows.
export const playerCoverSize = (bodyRows: number): 0 | 8 | 20 => (bodyRows >= 20 ? 20 : bodyRows >= 10 ? 8 : 0)
export const CONNECT_PITCH = ['Connect Spotify to see your queue, recent tracks, playlists and devices.', 'Needs Spotify Premium and a free developer app.'] as const

export type PlayerNote = { text: string; tone: 'ok' | 'error' }
export type PlayerView = { width: number; bodyRows: number; cover?: Seg[][]; caps?: MusicCaps; note?: PlayerNote }
export type PlayerExtra = { onMusic: (cmd: MusicCmd) => void; onCopy: (url: string) => void; seek?: (props: SeekBarProps) => unknown; volume?: (props: SeekBarProps) => unknown }

export function renderPlayer(els: { Box: any; Text: any; Button: any }, m: Model, t: Theme, v: PlayerView, now: number, extra: PlayerExtra) {
  const { Box, Text, Button } = els
  const c = t.colors, s = m.music ?? { status: 'closed' as const }
  const side = v.width >= SIDE_MIN
  const lw = side ? LEFT_COLS : v.width
  const row = (segs: Seg[], key: string) => renderSegs(els, fit(segs, lw), key)
  // State and note lines wrap, since a 30-column left column truncates "Open Spotify to see what's playing."
  const wrapped = (text: string, color: string, key: string) => <Box key={key}><Text color={color} wrap="wrap">{text}</Text></Box>
  const left: unknown[] = []
  if (s.status === 'unsupported') left.push(wrapped(s.hint, c.dim, 'state'))
  else if (s.status === 'closed') left.push(wrapped("Open Spotify to see what's playing.", c.dim, 'state'))
  else if (s.ad) left.push(wrapped('Ad', c.dim, 'state'))
  else if (!s.track) left.push(wrapped('Nothing playing.', c.dim, 'state'))
  else {
    const track = s.track, size = playerCoverSize(v.bodyRows)
    if (size > 0) {
      ;(v.cover ?? coverPlaceholder(size, size / 2, c.accent)).forEach((r, i) => left.push(renderSegs(els, r, 'cover' + i)))
      left.push(renderSegs(els, [], 'cover-gap'))
    }
    left.push(row([{ text: track.title, color: c.text, bold: true }], 'title'))
    if (track.artist) left.push(row([{ text: track.artist, color: c.dim }], 'artist'))
    if (track.album) left.push(row([{ text: track.album, color: c.dim }], 'album'))
    const colors = { text: c.text, accent: c.accent, faint: c.faint, dim: c.dim }
    const seek: SeekBarProps = { kind: 'progress', cols: lw, progressMs: s.progressMs, readAt: s.readAt, durationMs: track.durationMs, playing: s.playing, colors }
    left.push(extra.seek ? <Box key="seek" flexDirection="row">{extra.seek(seek) as any}</Box> : renderSegs(els, barRow(seek, lw, progressAt(s, now)), 'seek'))
    if (v.caps?.volume && s.volume !== undefined) {
      const vol: SeekBarProps = { kind: 'volume', cols: lw, level: s.volume, colors }
      left.push(extra.volume ? <Box key="volume" flexDirection="row">{extra.volume(vol) as any}</Box> : renderSegs(els, barRow(vol, lw, s.volume), 'volume'))
    }
    const buttons = musicControls(s, v.caps).map(b => <Button key={'music-' + b.key} label={b.label} hotkey={b.hotkey} plain dimColor={b.on === false} onPress={() => extra.onMusic(b.cmd)} />)
    if (v.caps?.raise) buttons.push(<Button key="music-raise" label="Open Spotify" hotkey="o" plain onPress={() => extra.onMusic({ cmd: 'raise' })} />)
    if (track.url) { const url = track.url; buttons.push(<Button key="music-copy" label="Copy link" hotkey="c" plain onPress={() => extra.onCopy(url)} />) }
    // wraps at the column's width, so a narrow column takes two rows of buttons rather than overflowing
    left.push(<Box key="controls" flexDirection="row" flexWrap="wrap" columnGap={2} width={lw} marginTop={1}>{buttons}</Box>)
  }
  if (v.note) left.push(wrapped(v.note.text, v.note.tone === 'error' ? c.fail : c.dim, 'note'))
  const rw = side ? Math.max(1, v.width - LEFT_COLS - GAP) : v.width
  const right = (
    <Box key="right" flexDirection="column" width={rw} marginTop={side ? 0 : 1}>
      {CONNECT_PITCH.map((l, i) => <Box key={'pitch' + i}><Text color={i === 0 ? c.text : c.dim} wrap="wrap">{l}</Text></Box>)}
    </Box>
  )
  return (
    <Box flexDirection={side ? 'row' : 'column'} columnGap={side ? GAP : 0} width={v.width}>
      <Box key="left" flexDirection="column" width={lw}>{left as any}</Box>
      {right}
    </Box>
  )
}
