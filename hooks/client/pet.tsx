import type { ClientSurface } from 'claude-code'
import { CLAWD_ROW, CLAWD_COLOR, SHINY_COLOR, CLAWD_SHEET, PET_COLS, composeFrame, halfBlock, mirrored, newPlayer, petPalette, petPose, playerFrame, stepPlayer, type PetId, type PetInput, type Player } from '../pets.ts'
import { renderSegs, type Seg } from '../layout.tsx'

export type PetClientProps = { pet: PetId; input: PetInput; overlays: string[]; reduced: boolean; compact: boolean; width: number }
// The clock (a wall-clock ms, the same scale as the model's event times) and the animation state it drives.
// The player is mutated while drawing; only the tick replaces the state object, so a draw never calls setState.
type PetState = number | { now: number; player: Player }

const TICK_MS = 83

export default function PetClient(props: PetClientProps, surface: ClientSurface<PetState>) {
  const { Box, Text } = surface.elements
  if (props.compact) return <Box><Text color={props.pet === 'clawd-shiny' ? SHINY_COLOR : CLAWD_COLOR}>{CLAWD_ROW}</Text></Box>

  const st = surface.state
  const now = typeof st === 'object' ? st.now : typeof st === 'number' ? st : Date.now()
  const player = typeof st === 'object' ? st.player : newPlayer()
  if (st === undefined && !props.reduced) {
    surface.setState({ now, player })
    surface.every(TICK_MS, () => {
      const cur = surface.state
      if (typeof cur === 'object') surface.setState({ now: Date.now(), player: cur.player })
    })
  }

  stepPlayer(player, CLAWD_SHEET, petPose(props.input, now), now, Math.max(0, props.width - PET_COLS))
  const px = composeFrame(CLAWD_SHEET, playerFrame(player, now), props.overlays, mirrored(player))
  const pad: Seg[] = player.x > 0 ? [{ text: ' '.repeat(player.x), color: CLAWD_COLOR }] : []
  return <Box flexDirection="column">{halfBlock(px, petPalette(CLAWD_SHEET, props.pet)).map((r, i) => renderSegs(surface.elements, [...pad, ...r], 'p' + i))}</Box>
}
