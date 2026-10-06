import { useEffect, useRef, useState } from 'react'
import { fieldFrame, fieldTickMs, type Field, type Seg, type Theme } from './data.ts'
import { useReducedMotion, useVisible } from './motion.ts'

// Braille cells are 0.6em wide in the mono face; line-height 1 makes a row one em tall.
const CELL_W = 0.6
const MAX_COLS = 120, MAX_ROWS = 60

export function PaneField({ field, colors, maxCols = MAX_COLS, maxRows = MAX_ROWS }: { field: Field; colors: Theme['colors']; maxCols?: number; maxRows?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const visible = useVisible()
  const [grid, setGrid] = useState({ cols: 0, rows: 0 })
  const [frame, setFrame] = useState<Seg[][]>([])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const fs = parseFloat(getComputedStyle(el).fontSize) || 13
      const cols = Math.min(maxCols, Math.floor(el.clientWidth / (fs * CELL_W))), rows = Math.min(maxRows,Math.floor(el.clientHeight / fs))
      setGrid(g => (g.cols === cols && g.rows === rows ? g : { cols, rows }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [maxCols, maxRows])

  useEffect(() => {
    if (!grid.cols || !grid.rows) { setFrame([]); return }
    const draw = (now: number) => setFrame(fieldFrame(grid.cols, grid.rows, colors, now / 1000, field))
    if (reduced || !visible) { draw(0); return }
    const tick = fieldTickMs(field)
    let raf = 0, last = -Infinity
    const loop = (now: number) => {
      if (now - last >= tick) { last = now; draw(now) }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [grid, colors, field, reduced, visible])

  return (
    <div ref={box} className="pfield" aria-hidden="true">
      {frame.map((row, y) => <div key={y}>{row.map((s, i) => <span key={i} style={{ color: s.color }}>{s.text}</span>)}</div>)}
    </div>
  )
}
