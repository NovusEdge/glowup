import { useEffect, useRef } from 'react'
import { CLAWD_SHEET, FRAME_H, OUTFIT_PAD, composeFrame, mirrored, newPlayer, petPalette, playerFrame, type PetSheet } from './data.ts'
import { petTick, type PetMode } from './petTick.ts'
import { useReducedMotion, useVisible } from './motion.ts'

export type { PetMode }

const HOP_MS = 1200

export function Pet(props: { scale: number; mode: PetMode; outfit?: string; shiny?: boolean; onClick?: () => void; className?: string; hopKey?: number; palette?: { body?: string; light?: string; shade?: string }; sheet?: PetSheet }) {
  const { scale, mode, outfit, shiny, onClick, className, hopKey, palette, sheet } = props
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const visible = useVisible()
  const hopUntil = useRef(0)
  const firstHop = useRef(true)
  const player = useRef(newPlayer())
  const playerSheet = useRef<PetSheet | undefined>(undefined)
  const s = sheet ?? CLAWD_SHEET
  // A custom sheet gets the full frame height, feet on the bottom row, so pets of any height stand level.
  const w = s.w * scale, h = ((sheet ? FRAME_H : s.h) + OUTFIT_PAD) * scale
  const drop = sheet ? FRAME_H - s.h : 0

  useEffect(() => {
    if (firstHop.current) { firstHop.current = false; return }
    hopUntil.current = performance.now() + HOP_MS
  }, [hopKey])

  useEffect(() => {
    const cv = ref.current, x = cv?.getContext('2d')
    if (!cv || !x) return
    const pal = sheet ? s.palette : petPalette(CLAWD_SHEET, shiny ? 'clawd-shiny' : 'clawd', palette)
    // a player's clips are cut from the sheet it first stepped; another sheet needs a fresh one
    if (playerSheet.current !== s) { playerSheet.current = s; player.current = newPlayer() }
    const p = player.current
    const draw = (pl: typeof p, now: number) => {
      const rows = composeFrame(s, playerFrame(pl, now), outfit ? [outfit] : [], mirrored(pl))
      // composeFrame pads only when an outfit is worn; without one, push him down so the feet stay put.
      const top = (outfit && s.outfits?.[outfit] ? 0 : OUTFIT_PAD) + drop
      x.clearRect(0, 0, w, h)
      rows.forEach((row, ry) => [...row].forEach((k, rx) => {
        const c = k === '.' ? undefined : pal[k]
        if (c) { x.fillStyle = c; x.fillRect(rx * scale, (ry + top) * scale, scale, scale) }
      }))
    }
    if (reduced || !visible) {
      const rest = newPlayer()
      petTick(rest, { kind: 'pose', pose: 'idle' }, 0, 0, s)
      draw(rest, 0)
      cv.style.transform = ''
      return
    }
    let raf = 0
    const frame = (now: number) => {
      const room = Math.max(0, (cv.parentElement?.clientWidth ?? 0) / scale - s.w)
      const m: PetMode = now < hopUntil.current ? { kind: 'pose', pose: 'hop' } : mode
      petTick(p, m, now, mode.kind === 'wander' ? room : 0, s)
      draw(p, now)
      cv.style.transform = mode.kind === 'wander' ? `translateX(${Math.round(p.x * scale)}px)` : ''
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [scale, mode.kind, mode.kind === 'pose' ? mode.pose : '', outfit, shiny, palette?.body, palette?.light, palette?.shade, reduced, visible, w, h, sheet])

  return <canvas ref={ref} width={w} height={h} className={className} onClick={onClick} aria-hidden="true" style={{ imageRendering: 'pixelated', display: 'block' }} />
}
