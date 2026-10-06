import type { ClientSurface } from 'claude-code'
import { CLAWD_ROW, CLAWD_COLOR, SHINY_COLOR, CLAWD_SHEET, BUILTIN_SHEETS, CRITTER_ROW, composeFrame, halfBlock, isClawd, mainColor, mirrored, newPlayer, petPalette, petPose, playerFrame, stepPlayer, type PetId, type PetInput, type PetSheet, type PetTint, type Player } from '../pets.ts'
import { renderSegs, type Seg } from '../layout.tsx'

// sheet is present only for a user pet; a built-in is looked up by id.
export type PetClientProps = { pet: PetId; input: PetInput; overlays: string[]; reduced: boolean; compact: boolean; width: number; tint?: PetTint; sheet?: PetSheet }
// now is wall-clock ms, the scale of the model's event times. The fields are mutated in place: the tick and
// the draw share one player, and only a changed picture replaces the state object (which redraws).
// props is the latest the draw saw, for the tick to read; stop cancels the timer.
// sheet is the one the player's clips were cut from; the engine keeps this state across redraws, so a different sheet needs a new player.
// sig is that sheet's content: props are cloned on their way here, so a user pet's sheet is a new object on every pane redraw.
type PetState = { now: number; player: Player; sheet: PetSheet; sig: string; props: PetClientProps; stop?: () => void }

const TICK_MS = 83
// The tests move time with this; Date.now is read-only in the test sandbox.
export const clock = { now: () => Date.now() }
const quiet = (p: PetClientProps) => p.reduced || p.compact
const cols = (surface: ClientSurface<PetState | number>, p: PetClientProps) => (surface.columns > 0 ? surface.columns : p.width)
const sheetOf = (p: PetClientProps) => p.sheet ?? (Object.hasOwn(BUILTIN_SHEETS, p.pet) ? BUILTIN_SHEETS[p.pet] : undefined) ?? CLAWD_SHEET
function resheet(st: PetState, sheet: PetSheet) {
  if (st.sheet === sheet) return
  st.sheet = sheet
  const sig = JSON.stringify(sheet)
  if (sig === st.sig) return
  st.sig = sig
  st.player = newPlayer()
}
const maxXOf = (surface: ClientSurface<PetState | number>, p: PetClientProps) => Math.max(0, cols(surface, p) - sheetOf(p).w)

// A sprite wider than the strip is cut at its right edge here: left to the layout, a too-wide row shrinks every segment and adds an ellipsis.
// Every cell is one column wide (half blocks and spaces).
function cut(segs: Seg[], room: number): Seg[] {
  const out: Seg[] = []
  let left = Math.max(0, room)
  for (const s of segs) {
    if (left <= 0) break
    const text = [...s.text].slice(0, left).join('')
    out.push({ ...s, text })
    left -= [...text].length
  }
  return out
}

// What the eye can tell apart: a new frame, a new clip, a step.
const look = (pl: Player) => `${pl.seg?.name}:${pl.seg?.fi}:${pl.x}:${pl.dir}`

function startClock(surface: ClientSurface<PetState | number>, st: PetState) {
  st.stop = surface.every(TICK_MS, () => {
    const cur = surface.state
    if (typeof cur !== 'object') return
    if (quiet(cur.props)) { cur.stop?.(); cur.stop = undefined; return }
    const sheet = sheetOf(cur.props)
    resheet(cur, sheet)
    const before = look(cur.player)
    cur.now = clock.now()
    stepPlayer(cur.player, sheet, petPose(cur.props.input, cur.now), cur.now, maxXOf(surface, cur.props))
    if (look(cur.player) !== before) surface.setState({ ...cur })
  })
}

export default function PetClient(props: PetClientProps, surface: ClientSurface<PetState | number>) {
  const { Box, Text } = surface.elements
  const st = surface.state
  if (typeof st === 'object') st.props = props
  if (props.compact) {
    const color = props.pet === 'clawd-shiny' ? SHINY_COLOR : isClawd(props.pet) ? props.tint?.body ?? CLAWD_COLOR : mainColor(sheetOf(props))
    return <Box><Text color={color}>{isClawd(props.pet) ? CLAWD_ROW : CRITTER_ROW}</Text></Box>
  }

  const sheet = sheetOf(props)
  let now: number, player: Player
  if (typeof st === 'object') {
    resheet(st, sheet)
    now = st.now
    player = st.player
    if (!st.stop && !props.reduced) startClock(surface, st)
  } else {
    now = typeof st === 'number' ? st : clock.now()
    player = newPlayer()
    if (st === undefined && !props.reduced) {
      const fresh: PetState = { now, player, sheet, sig: JSON.stringify(sheet), props }
      surface.setState(fresh)
      startClock(surface, fresh)
    }
  }

  stepPlayer(player, sheet, petPose(props.input, now), now, maxXOf(surface, props))
  const px = composeFrame(sheet, playerFrame(player, now), props.overlays, mirrored(player))
  const pad: Seg[] = player.x > 0 ? [{ text: ' '.repeat(player.x), color: CLAWD_COLOR }] : []
  const room = cols(surface, props)
  return <Box flexDirection="column">{halfBlock(px, petPalette(sheet, props.pet, props.tint)).map((r, i) => renderSegs(surface.elements, cut([...pad, ...r], room), 'p' + i))}</Box>
}
