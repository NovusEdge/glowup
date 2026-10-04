import { useEffect, useState, type CSSProperties } from 'react'
import type { Span } from '../../../hooks/color.ts'
import { spinnerCells, spinnerWordSpans, type Cell, type OrbState } from '../../../hooks/motion.ts'
import { resolveLook, type Look } from '../../../hooks/packs.ts'
import type { SpinnerId } from '../../../hooks/packs.ts'

export const PACK_NAMES = ['classic', 'crt', 'cozy', 'arcade'] as const

export const lookOf = (pack: string, spinner?: SpinnerId): Look =>
  resolveLook({ colors: pack, motion: pack, ...(spinner ? { spinner } : {}) }, {}, {}).look

// The frame shown when motion is off, and the one prerendered into the HTML.
const STILL_MS = 1500
const FRAME_MS = 1000 / 30

export function useClock() {
  const [now, setNow] = useState(STILL_MS)
  const [reduced, setReduced] = useState(false)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const frozen = reduced || paused
  useEffect(() => {
    // The reduced state above only lands after the first render, so read the query here too.
    if (frozen || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0, last = 0
    const origin = performance.now() - now
    const tick = (ts: number) => {
      if (ts - last >= FRAME_MS) { last = ts; setNow(ts - origin) }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // `now` seeds the origin so unpausing continues from the frozen frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozen])

  return { now, reduced, paused, setPaused }
}

// Bit 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
const QUADRANTS: Record<string, number> = {
  '▘': 1, '▝': 2, '▖': 4, '▗': 8, '▀': 3, '▄': 12, '▌': 5, '▐': 10,
  '▚': 9, '▞': 6, '▛': 7, '▜': 11, '▙': 13, '▟': 14, '█': 15,
}
const CORNER = ['0 0', '100% 0', '0 100%', '100% 100%']

// A font glyph leaves hairline gaps between rows, so block characters are drawn as boxes of
// fixed pixel size: a half block is a hard-stop gradient, a quadrant is a set of quarter fills.
function blockStyle(mask: number, fg: string, bg?: string): CSSProperties {
  const back = bg ?? 'transparent'
  if (mask === 15) return { background: fg }
  if (mask === 3) return { background: `linear-gradient(${fg} 50%, ${back} 50%)` }
  if (mask === 12) return { background: `linear-gradient(${back} 50%, ${fg} 50%)` }
  const on = [0, 1, 2, 3].filter(i => mask & (1 << i))
  return {
    backgroundColor: back,
    backgroundImage: on.map(() => `linear-gradient(${fg}, ${fg})`).join(','),
    backgroundPosition: on.map(i => CORNER[i]).join(','),
    backgroundSize: '50% 50%',
    backgroundRepeat: 'no-repeat',
  }
}

export function Cells({ rows, label, size = 'md' }: { rows: Cell[][]; label?: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`cells cells-${size}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {rows.map((r, y) => (
        <span className="crow" key={y}>
          {r.map((c, x) => {
            const mask = QUADRANTS[c.ch]
            if (mask !== undefined) return <span className="cc" key={x} style={blockStyle(mask, c.fg, c.bg)} />
            return <span className="cc" key={x} style={{ color: c.fg, ...(c.bg ? { background: c.bg } : {}) }}>{c.ch === ' ' ? '' : c.ch}</span>
          })}
        </span>
      ))}
    </span>
  )
}

export function Spans({ spans }: { spans: Span[] }) {
  return <>{spans.map((s, i) => <span key={i} style={{ color: s.color, ...(s.bg ? { background: s.bg } : {}), ...(s.bold ? { fontWeight: 700 } : {}) }}>{s.text}</span>)}</>
}

export function SpinnerView({ look, now, state, name }: { look: Look; now: number; state?: OrbState; name: string }) {
  const c = look.theme.colors
  const rows = spinnerCells(look.motion.spinner, now, { color: look.motion.color, bg: look.bg, fg: c.text }, state)
  const word = (look.theme.spinnerWords[0] ?? 'Thinking') + '…'
  return (
    <span className="spin">
      <Cells rows={rows} label={`${name} spinner`} size="lg" />
      <span className="sr-only">{word}</span>
      <span className="spin-word" aria-hidden="true"><Spans spans={spinnerWordSpans(look, word, now)} /></span>
    </span>
  )
}

export function Term({ look, children, className = '' }: { look: Look; children: React.ReactNode; className?: string }) {
  return <div className={`term ${className}`} style={{ background: look.bg, color: look.theme.colors.text, borderColor: look.borderColor }}>{children}</div>
}

export function PackSwitch({ value, onChange }: { value: string; onChange: (p: string) => void }) {
  return (
    <div className="seg" role="group" aria-label="Pack">
      {PACK_NAMES.map(p => (
        <button key={p} type="button" aria-pressed={p === value} onClick={() => onChange(p)}>{p}</button>
      ))}
    </div>
  )
}

export function MotionToggle({ clock }: { clock: ReturnType<typeof useClock> }) {
  const off = clock.reduced || clock.paused
  return (
    <button type="button" className="chip" disabled={clock.reduced} aria-pressed={off} onClick={() => clock.setPaused(!clock.paused)}>
      {clock.reduced ? 'Motion off (system setting)' : clock.paused ? 'Play' : 'Pause'}
    </button>
  )
}
