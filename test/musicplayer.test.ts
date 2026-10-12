import { test, expect } from 'claude-code/testing'
import { renderPlayer, playerCoverSize, CONNECT_PITCH, type PlayerView } from '../hooks/musicplayer.tsx'
import { initialModel, type Model } from '../hooks/model.ts'
import { resolveTheme } from '../hooks/themes.ts'
import { visibleLength } from '../hooks/layout.tsx'
import type { Music } from '../hooks/music/parse.ts'
import type { MusicCaps } from '../hooks/music/reader.ts'

const T = resolveTheme('classic', {}).theme
const els = { Box: 'Box', Text: 'Text', Button: 'Button' }
const walk = (n: any, out: any[] = []): any[] => {
  if (typeof n === 'string') out.push(n)
  else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) }
  return out
}
// each Seg row Box (children all Texts), as the text it shows; the pitch, state and note lines wrap, so their Boxes are left out
const rows = (tree: any) => walk(tree).filter(n => n?.type === 'Box' && !/^(pitch|state|note)/.test(String(n.props?.key)) && (n.children ?? []).length > 0 && n.children.every((c: any) => c?.type === 'Text'))
  .map(n => walk(n).filter(x => typeof x === 'string').join(''))
const keys = (tree: any) => walk(tree).map(n => n?.props?.key).filter(Boolean)
const text = (tree: any) => walk(tree).filter(n => typeof n === 'string').join(' ')
const cells = (s: string) => visibleLength([{ text: s, color: '' }])

const MAC: MusicCaps = { repeat: ['off', 'context'], shuffle: true, raise: true, volume: true }
const LINUX: MusicCaps = { repeat: [], shuffle: false, raise: true, volume: false }
const PCTL: MusicCaps = { repeat: [], shuffle: false, raise: false, volume: false }
const track = { id: '/com/spotify/track/t', title: 'BACK 2 THE BASICS', artist: 'Double A-Ron', album: 'Commercial Break 2', durationMs: 174_000, url: 'https://open.spotify.com/track/t' }
const playing = (over: Partial<Extract<Music, { status: 'open' }>> = {}): Model => ({
  ...initialModel(),
  music: { status: 'open', track, playing: true, ad: false, progressMs: 60_000, readAt: 0, shuffle: false, repeat: 'off', volume: 0.5, ...over },
})
const view = (over: Partial<PlayerView> = {}): PlayerView => ({ width: 88, bodyRows: 24, caps: MAC, ...over })
const extra = { onMusic: () => {}, onCopy: () => {} }

test('the cover follows the rows granted', () => {
  expect(playerCoverSize(24)).toBe(20)
  expect(playerCoverSize(20)).toBe(20)
  expect(playerCoverSize(19)).toBe(8)
  expect(playerCoverSize(18)).toBe(8)
  expect(playerCoverSize(10)).toBe(8)
  expect(playerCoverSize(9)).toBe(0)
})

test('a full grant draws the 20x10 placeholder, the track, both bars and every control', () => {
  const tree = renderPlayer(els, playing(), T, view(), 0, extra)
  const r = rows(tree)
  // the placeholder is 10 rows of 20 cells, with the note on its second row
  expect(r.filter(l => cells(l) === 20 && l.trim() === '♪')).toHaveLength(1)
  expect(text(tree)).toContain('BACK 2 THE BASICS')
  expect(text(tree)).toContain('Double A-Ron')
  expect(r.some(l => l.startsWith('▶ 1:00 '))).toBe(true)
  expect(r.some(l => l.startsWith('vol '))).toBe(true)
  expect(keys(tree)).toEqual(expect.arrayContaining(['music-previous', 'music-playpause', 'music-next', 'music-shuffle', 'music-repeat', 'music-raise', 'music-copy']))
})

test('a short grant shrinks the cover to 8x4, and a very short one drops it', () => {
  const small = rows(renderPlayer(els, playing(), T, view({ bodyRows: 13 }), 0, extra))
  expect(small.filter(l => cells(l) === 8 && l.trim() === '♪')).toHaveLength(1)
  const none = rows(renderPlayer(els, playing(), T, view({ bodyRows: 9 }), 0, extra))
  expect(none.some(l => l.includes('♪'))).toBe(false)
})

test('a cover given is drawn in place of the placeholder', () => {
  const cover = Array.from({ length: 10 }, () => [{ text: '▀'.repeat(20), color: '#102030', bg: '#405060' }])
  const r = rows(renderPlayer(els, playing(), T, view({ cover }), 0, extra))
  expect(r.filter(l => l === '▀'.repeat(20))).toHaveLength(10)
})

test('controls follow the player caps and the track link', () => {
  const linux = keys(renderPlayer(els, playing(), T, view({ caps: LINUX }), 0, extra))
  expect(linux).not.toContain('music-shuffle')
  expect(linux).toContain('music-raise')
  expect(rows(renderPlayer(els, playing(), T, view({ caps: LINUX }), 0, extra)).some(l => l.startsWith('vol '))).toBe(false)
  const pctl = keys(renderPlayer(els, playing(), T, view({ caps: PCTL }), 0, extra))
  expect(pctl).not.toContain('music-raise')
  const noLink = keys(renderPlayer(els, playing({ track: { ...track, url: undefined } }), T, view(), 0, extra))
  expect(noLink).not.toContain('music-copy')
})

test('each non-playing state draws one line and no controls', () => {
  const states: [Music, string][] = [
    [{ status: 'closed' }, "Open Spotify to see what's playing."],
    [{ status: 'unsupported', hint: 'Spotify shows here on Linux and macOS.' }, 'Spotify shows here on Linux and macOS.'],
    [{ status: 'open', playing: true, ad: true, progressMs: 0, readAt: 0 }, 'Ad'],
    [{ status: 'open', playing: false, ad: false, progressMs: 0, readAt: 0 }, 'Nothing playing.'],
  ]
  for (const [music, line] of states) {
    const tree = renderPlayer(els, { ...initialModel(), music }, T, view(), 0, extra)
    expect(text(tree)).toContain(line)
    expect(walk(tree).find(n => n?.type === 'Text' && n.children?.[0] === line).props.wrap).toBe('wrap')
    expect(keys(tree).filter(k => String(k).startsWith('music-'))).toEqual([])
    expect(text(tree)).toContain(CONNECT_PITCH[0]!)
  }
})

test('no row is wider than the grant', () => {
  for (let width = 30; width <= 120; width += 7) {
    for (const bodyRows of [9, 13, 24]) {
      const r = rows(renderPlayer(els, playing({ track: { ...track, title: 'A title far longer than any column could hold, by design' } }), T, view({ width, bodyRows }), 0, extra))
      for (const l of r) expect(cells(l)).toBeLessThanOrEqual(width)
    }
  }
})

test('side by side from 80 columns, stacked below', () => {
  const side = renderPlayer(els, playing(), T, view({ width: 80 }), 0, extra) as any
  expect(side.props.flexDirection).toBe('row')
  const stacked = renderPlayer(els, playing(), T, view({ width: 79 }), 0, extra) as any
  expect(stacked.props.flexDirection).toBe('column')
})

test('the seek and volume builders replace the static bars', () => {
  const seen: string[] = []
  const tree = renderPlayer(els, playing(), T, view(), 0, { ...extra, seek: p => { seen.push(p.kind); return 'SEEK' }, volume: p => { seen.push(p.kind); return 'VOL' } })
  expect(seen).toEqual(['progress', 'volume'])
  expect(walk(tree)).toContain('SEEK')
  expect(walk(tree)).toContain('VOL')
})

test('a press reaches onMusic and onCopy', () => {
  const cmds: unknown[] = [], copied: string[] = []
  const tree = renderPlayer(els, playing(), T, view(), 0, { onMusic: c => cmds.push(c), onCopy: u => copied.push(u) })
  const btn = (k: string) => walk(tree).find(n => n?.props?.key === k)
  btn('music-raise').onPress({})
  btn('music-copy').onPress({})
  btn('music-playpause').onPress({})
  expect(cmds).toEqual([{ cmd: 'raise' }, { cmd: 'playpause' }])
  expect(copied).toEqual([track.url])
})

test('a note shows under the player in its tone', () => {
  const tree = renderPlayer(els, playing(), T, view({ note: { text: 'Could not copy the link: no clipboard', tone: 'error' } }), 0, extra)
  const n = walk(tree).find(x => x?.type === 'Text' && x.children?.[0] === 'Could not copy the link: no clipboard')
  expect(n.props.color).toBe(T.colors.fail)
  expect(n.props.wrap).toBe('wrap')
})
