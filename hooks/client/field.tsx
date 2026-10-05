import type { ClientSurface } from 'claude-code'
import { renderSegs, type Seg } from '../layout.tsx'
import { fieldFrame, FIELD_TICK_MS } from '../effects.ts'
import type { Colors } from '../themes.ts'
import type { Field } from '../packs.ts'

// Either a renderer plugin's frames (glowup.field), checked and cut to the open rows, played
// every ms; or a built-in shape, drawn fresh each tick from the time, so it never loops or stutters.
export type FieldClientProps = { reduced: boolean } & (
  | { frames: Seg[][][]; ms: number }
  | { live: { cols: number; rows: number; colors: Colors; field: Field } }
)
// i counts ticks; at is when the timer started; ms the period it was started with.
type FieldState = { i: number; at: number; ms: number; stop?: () => void }

// The tests move time with this; Date.now is read-only in the test sandbox.
export const clock = { now: () => Date.now() }

export default function FieldClient(props: FieldClientProps, surface: ClientSurface<FieldState>) {
  const { Box } = surface.elements
  const ms = 'frames' in props ? props.ms : FIELD_TICK_MS
  let st = surface.state
  if (!st || st.ms !== ms || (props.reduced && st.stop)) {
    st?.stop?.()
    st = { i: 0, at: clock.now(), ms }
    if (!props.reduced) {
      st.stop = surface.every(ms, () => {
        const cur = surface.state
        if (cur) surface.setState({ ...cur, i: cur.i + 1 })
      })
    }
    surface.setState(st)
  }
  let rows: Seg[][]
  if ('frames' in props) rows = props.frames[st.i % props.frames.length] ?? []
  else {
    const { cols, rows: n, colors, field } = props.live
    rows = fieldFrame(cols, n, colors, props.reduced ? 0 : (clock.now() - st.at) / 1000, field)
  }
  return <Box flexDirection="column">{rows.map((r, i) => renderSegs(surface.elements, r, 'f' + i))}</Box>
}
