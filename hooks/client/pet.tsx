import type { ClientSurface } from 'claude-code'
import { CLAWD_ROW, CLAWD_COLOR, SHINY_COLOR, CLAWD_SHEET, PET_COLS, composeFrame, halfBlock, mirrored, newPlayer, petPalette, petPose, playerFrame, stepPlayer, type PetId, type PetInput, type Player } from '../pets.ts'
import { renderSegs, type Seg } from '../layout.tsx'

export type PetClientProps = { pet: PetId; input: PetInput; overlays: string[]; reduced: boolean; compact: boolean; width: number }
// now is wall-clock ms, the scale of the model's event times. The fields are mutated in place: the tick and
// the draw share one player, and only a changed picture replaces the state object (which redraws).
// props is the latest the draw saw, for the tick to read; stop cancels the timer.
type PetState = { now: number; player: Player; props: PetClientProps; stop?: () => void }

const TICK_MS = 83
// The tests move time with this; Date.now is read-only in the test sandbox.
export const clock = { now: () => Date.now() }
const quiet = (p: PetClientProps) => p.reduced || p.compact
const cols = (surface: ClientSurface<PetState | number>, p: PetClientProps) => (surface.columns > 0 ? surface.columns : p.width)
const maxXOf = (surface: ClientSurface<PetState | number>, p: PetClientProps) => Math.max(0, cols(surface, p) - PET_COLS)

// What the eye can tell apart: a new frame, a new clip, a step.
const look = (pl: Player) => `${pl.seg?.name}:${pl.seg?.fi}:${pl.x}:${pl.dir}`

function startClock(surface: ClientSurface<PetState | number>, st: PetState) {
  st.stop = surface.every(TICK_MS, () => {
    const cur = surface.state
    if (typeof cur !== 'object') return
    if (quiet(cur.props)) { cur.stop?.(); cur.stop = undefined; return }
    const before = look(cur.player)
    cur.now = clock.now()
    stepPlayer(cur.player, CLAWD_SHEET, petPose(cur.props.input, cur.now), cur.now, maxXOf(surface, cur.props))
    if (look(cur.player) !== before) surface.setState({ ...cur })
  })
}

export default function PetClient(props: PetClientProps, surface: ClientSurface<PetState | number>) {
  const { Box, Text } = surface.elements
  const st = surface.state
  if (typeof st === 'object') st.props = props
  if (props.compact) return <Box><Text color={props.pet === 'clawd-shiny' ? SHINY_COLOR : CLAWD_COLOR}>{CLAWD_ROW}</Text></Box>

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

  stepPlayer(player, CLAWD_SHEET, petPose(props.input, now), now, maxXOf(surface, props))
  const px = composeFrame(CLAWD_SHEET, playerFrame(player, now), props.overlays, mirrored(player))
  const pad: Seg[] = player.x > 0 ? [{ text: ' '.repeat(player.x), color: CLAWD_COLOR }] : []
  return <Box flexDirection="column">{halfBlock(px, petPalette(CLAWD_SHEET, props.pet)).map((r, i) => renderSegs(surface.elements, [...pad, ...r], 'p' + i))}</Box>
}
