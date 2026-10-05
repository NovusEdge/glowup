import type { ClientSurface } from 'claude-code'
import { renderSegs, type Seg } from '../layout.tsx'

// frames come from a renderer plugin (glowup.field), checked and cut to the pane's open rows.
export type FieldClientProps = { frames: Seg[][][]; ms: number; reduced: boolean }
// i is the frame on screen; ms the period the running timer was started with.
type FieldState = { i: number; ms: number; stop?: () => void }

export default function FieldClient(props: FieldClientProps, surface: ClientSurface<FieldState>) {
  const { Box } = surface.elements
  let st = surface.state
  if (!st || st.ms !== props.ms || (props.reduced && st.stop)) {
    st?.stop?.()
    st = { i: 0, ms: props.ms }
    if (!props.reduced) {
      st.stop = surface.every(props.ms, () => {
        const cur = surface.state
        if (cur) surface.setState({ ...cur, i: cur.i + 1 })
      })
    }
    surface.setState(st)
  }
  const frame = props.frames[st.i % props.frames.length] ?? []
  return <Box flexDirection="column">{frame.map((r, i) => renderSegs(surface.elements, r, 'f' + i))}</Box>
}
