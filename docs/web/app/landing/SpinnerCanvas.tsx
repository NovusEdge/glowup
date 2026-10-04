import { useEffect, useRef } from 'react'
import { spinnerCells, type Look, type OrbState, type SpinnerId } from './data.ts'
import { cellOps } from './cells.ts'
import { useReducedMotion, useVisible } from './motion.ts'

const FRAME_MS = 50
const sr: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }

export function SpinnerCanvas(props: { id: SpinnerId; look: Look; state?: OrbState; cw: number; ch: number; minRows?: number; label?: string }) {
  const { id, look, state, cw, ch, minRows, label } = props
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const visible = useVisible()

  useEffect(() => {
    const cv = ref.current, x = cv?.getContext('2d')
    if (!cv || !x) return
    const dpr = window.devicePixelRatio || 1
    const o = { color: look.motion.color, bg: look.bg, fg: look.theme.colors.text }
    const draw = (t: number) => {
      const { width, height, ops } = cellOps(spinnerCells(id, t, o, state), cw, ch, minRows)
      cv.width = Math.round(width * dpr); cv.height = Math.round(height * dpr)
      cv.style.width = `${width}px`; cv.style.height = `${height}px`
      x.setTransform(dpr, 0, 0, dpr, 0, 0)
      x.clearRect(0, 0, width, height)
      x.textAlign = 'center'; x.textBaseline = 'middle'
      for (const p of ops) {
        x.fillStyle = p.color
        if (p.kind === 'rect') x.fillRect(p.x, p.y, p.w, p.h)
        else if (p.kind === 'dot') { x.beginPath(); x.arc(p.x, p.y, p.r, 0, Math.PI * 2); x.fill() }
        else { x.font = `${p.size}px 'JetBrains Mono', monospace`; x.fillText(p.ch, p.x, p.y) }
      }
    }
    if (reduced || !visible) { draw(0); return }
    let raf = 0, last = -Infinity
    const frame = (now: number) => {
      if (now - last >= FRAME_MS) { last = now; draw(now) }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [id, look, state, cw, ch, minRows, reduced, visible])

  return (
    <>
      <canvas ref={ref} aria-hidden="true" role="presentation" />
      {label ? <span style={sr}>{label}</span> : null}
    </>
  )
}
