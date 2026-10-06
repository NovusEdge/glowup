import type { ClientSurface } from 'claude-code'
import { CLAWD_ROW, CLAWD_COLOR, SHINY_COLOR, CLAWD_SHEET, BUILTIN_SHEETS, CRITTER_ROW, composeFrame, halfBlock, isClawd, mainColor, mirrored, newPlayer, petPalette, petPose, playerFrame, stepPlayer, type PetId, type PetInput, type PetSheet, type PetTint, type Player } from '../pets.ts'
import { renderSegs, type Seg } from '../layout.tsx'

// sheet is present only for a user pet; a built-in is looked up by id.
export type PetClientProps = { pet: PetId; input: PetInput; overlays: string[]; reduced: boolean; compact: boolean; width: number; tint?: PetTint; sheet?: PetSheet }
// now is wall-clock ms, the scale of the model's event times. The fields are mutated in place: the tick and
// the draw share one player, and only a changed picture replaces the state object (which redraws).
// props is the latest the draw saw, for the tick to read; stop cancels the timer.
type PetState = { now: number; player: Player; props: PetClientProps; stop?: () => void }

const TICK_MS = 83
// The tests move time with this; Date.now is read-only in the test sandbox.
export const clock = { now: () => Date.now() }
const quiet = (p: PetClientProps) => p.reduced || p.compact
const cols = (surface: ClientSurface<PetState | number>, p: PetClientProps) => (surface.columns > 0 ? surface.columns : p.width)
const sheetOf = (p: PetClientProps) => p.sheet ?? BUILTIN_SHEETS[p.pet] ?? CLAWD_SHEET
const maxXOf = (surface: ClientSurface<PetState | number>, p: PetClientProps) => Math.max(0, cols(surface, p) - sheetOf(p).w)

// What the eye can tell apart: a new frame, a new clip, a step.
const look = (pl: Player) => `${pl.seg?.name}:${pl.seg?.fi}:${pl.x}:${pl.dir}`

function startClock(surface: ClientSurface<PetState | number>, st: PetState) {
  st.stop = surface.every(TICK_MS, () => {
    const cur = surface.state
    if (typeof cur !== 'object') return
    if (quiet(cur.props)) { cur.stop?.(); cur.stop = undefined; return }
    const before = look(cur.player)
    cur.now = clock.now()
    stepPlayer(cur.player, sheetOf(cur.props), petPose(cur.props.input, cur.now), cur.now, maxXOf(surface, cur.props))
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

  let now: number, player: Player
  if (typeof st === 'object') {
    now = st.now
    player = st.player
    if (!st.stop && !props.reduced) startClock(surface, st)
  } else {
    now = typeof st === 'number' ? st : clock.now()
    player = newPlayer()
    if (st === undefined && !props.reduced) {
      const fresh: PetState = { now, player, props }
      surface.setState(fresh)
      startClock(surface, fresh)
    }
  }

  const sheet = sheetOf(props)
  stepPlayer(player, sheet, petPose(props.input, now), now, maxXOf(surface, props))
  const px = composeFrame(sheet, playerFrame(player, now), props.overlays, mirrored(player))
  const pad: Seg[] = player.x > 0 ? [{ text: ' '.repeat(player.x), color: CLAWD_COLOR }] : []
  return <Box flexDirection="column">{halfBlock(px, petPalette(sheet, props.pet, props.tint)).map((r, i) => renderSegs(surface.elements, [...pad, ...r], 'p' + i))}</Box>
}
