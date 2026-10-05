import { useRef, useState } from 'react'
import { hexToHsv, hsvToHex, type Hsv } from './color.ts'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const wrap = (h: number) => ((h % 360) + 360) % 360

// The disc is conic-gradient(from 90deg, ...): hue 0 sits at 3 o'clock and hue grows clockwise, which is
// atan2 on screen coordinates (y down), so the thumb and the pointer math share one angle.
export function ColorWheel({ hex, onChange, label }: { hex: string; onChange(hex: string): void; label: string }) {
  const [hsv, setHsv] = useState(() => hexToHsv(hex))
  const disc = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLDivElement>(null)

  // Own state keeps the hue when saturation or brightness hits 0 (hex alone cannot hold it).
  if (hex.toLowerCase() !== hsvToHex(hsv)) setHsv(hexToHsv(hex))

  const set = (next: Hsv) => { setHsv(next); onChange(hsvToHex(next)) }

  const fromPointer = (e: React.PointerEvent) => {
    const r = disc.current!.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2)
    set({ h: wrap(Math.atan2(dy, dx) * 180 / Math.PI), s: clamp01(Math.hypot(dx, dy) / (r.width / 2)), v: hsv.v })
  }

  const onKey = (e: React.KeyboardEvent) => {
    const hue = e.shiftKey ? 10 : 2, sat = (e.shiftKey ? 10 : 2) / 100
    const next = {
      ArrowRight: { ...hsv, h: wrap(hsv.h + hue) },
      ArrowLeft: { ...hsv, h: wrap(hsv.h - hue) },
      ArrowUp: { ...hsv, s: clamp01(hsv.s + sat) },
      ArrowDown: { ...hsv, s: clamp01(hsv.s - sat) },
    }[e.key]
    if (!next) return
    e.preventDefault()
    set(next)
  }

  const rad = hsv.h * Math.PI / 180
  return (
    <div className="wheel">
      <div
        ref={disc} className="wheel-disc"
        onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e) }}
        onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e) }}
        // The compatibility mousedown after pointerdown moves focus to the body, so focus waits for pointerup.
        onPointerUp={e => { if (e.button === 0) thumb.current?.focus() }}
      >
        <div className="wheel-dark" style={{ opacity: 1 - hsv.v }} />
        <div
          ref={thumb} className="wheel-thumb" tabIndex={0} role="slider" onKeyDown={onKey}
          aria-label={`${label} hue and saturation`}
          aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)}
          aria-valuetext={`hue ${Math.round(hsv.h)}°, saturation ${Math.round(hsv.s * 100)}%`}
          style={{ left: `${50 + 50 * hsv.s * Math.cos(rad)}%`, top: `${50 + 50 * hsv.s * Math.sin(rad)}%`, background: hex }}
        />
      </div>
      <input
        type="range" className="wheel-v" min={0} max={100} aria-label={`${label} brightness`}
        value={Math.round(hsv.v * 100)} onChange={e => set({ ...hsv, v: Number(e.target.value) / 100 })}
      />
    </div>
  )
}
