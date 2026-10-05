import { useEffect, useRef } from 'react'
import { CLAWD_SHEET, OUTFIT_PAD, composeFrame, mirrored, newPlayer, petPalette, playerFrame } from './data.ts'
import { petTick, type PetMode } from './petTick.ts'
import { useReducedMotion, useVisible } from './motion.ts'

export type { PetMode }

const HOP_MS = 1200

export function Pet(props: { scale: number; mode: PetMode; outfit?: string; shiny?: boolean; onClick?: () => void; className?: string; hopKey?: number; palette?: { body?: string; light?: string; shade?: string } }) {
  const { scale, mode, outfit, shiny, onClick, className, hopKey, palette } = props
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const visible = useVisible()
  const hopUntil = useRef(0)
  const firstHop = useRef(true)
  const player = useRef(newPlayer())
  const w = CLAWD_SHEET.w * scale, h = (CLAWD_SHEET.h + OUTFIT_PAD) * scale

  useEffect(() => {
    if (firstHop.current) { firstHop.current = false; return }
    hopUntil.current = performance.now() + HOP_MS
  }, [hopKey])

  useEffect(() => {
    const cv = ref.current, x = cv?.getContext('2d')
    if (!cv || !x) return
    const pal = petPalette(CLAWD_SHEET, shiny ? 'clawd-shiny' : 'clawd', palette)
    const p = player.current
    const draw = (pl: typeof p, now: number) => {
      const rows = composeFrame(CLAWD_SHEET, playerFrame(pl, now), outfit ? [outfit] : [], mirrored(pl))
      // composeFrame pads only when an outfit is worn; without one, push him down so the feet stay put.
      const top = outfit && CLAWD_SHEET.outfits?.[outfit] ? 0 : OUTFIT_PAD
      x.clearRect(0, 0, w, h)
      rows.forEach((row, ry) => [...row].forEach((k, rx) => {
        const c = k === '.' ? undefined : pal[k]
        if (c) { x.fillStyle = c; x.fillRect(rx * scale, (ry + top) * scale, scale, scale) }
      }))
    }
    if (reduced || !visible) {
      const rest = newPlayer()
      petTick(rest, { kind: 'pose', pose: 'idle' }, 0, 0)
      draw(rest, 0)
      cv.style.transform = ''
      return
    }
    let raf = 0
    const frame = (now: number) => {
      const room = Math.max(0, (cv.parentElement?.clientWidth ?? 0) / scale - CLAWD_SHEET.w)
      const m: PetMode = now < hopUntil.current ? { kind: 'pose', pose: 'hop' } : mode
      petTick(p, m, now, mode.kind === 'wander' ? room : 0)
      draw(p, now)
      cv.style.transform = mode.kind === 'wander' ? `translateX(${Math.round(p.x * scale)}px)` : ''
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [scale, mode.kind, mode.kind === 'pose' ? mode.pose : '', outfit, shiny, palette?.body, palette?.light, palette?.shade, reduced, visible, w, h])

  return <canvas ref={ref} width={w} height={h} className={className} onClick={onClick} aria-hidden="true" style={{ imageRendering: 'pixelated', display: 'block' }} />
}
