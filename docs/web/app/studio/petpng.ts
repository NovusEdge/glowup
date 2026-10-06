// JSX-free: node --test runs it. The page decodes the PNG with a canvas; this turns its pixels into a pet file.
import { PET_ANIMS, FRAME_W, FRAME_H, MAX_COLORS, MAX_FRAMES, ANIM_MS, WALKS, MIN_MS, validatePetFile, type PetFile, type PetAnimName } from '../landing/data.ts'

export type Pixels = { width: number; height: number; data: Uint8Array | Uint8ClampedArray }
export const MAX_SHEET_W = FRAME_W * MAX_FRAMES, MAX_SHEET_H = FRAME_H * PET_ANIMS.length
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const hex2 = (n: number) => n.toString(16).padStart(2, '0')

export const msFor = (anim: PetAnimName, speed = 1) => Math.max(MIN_MS, Math.round(ANIM_MS[anim] / speed))

export function petFromPixels(img: Pixels, name = 'my-pet'): { file: PetFile } | { error: string } {
  const { width, height, data } = img
  if (!width || !height || width % FRAME_W || height % FRAME_H) return { error: `The sheet is ${width} × ${height} px; it must be a whole number of ${FRAME_W} × ${FRAME_H} px frames.` }
  if (height > MAX_SHEET_H) return { error: `The sheet has ${height / FRAME_H} rows of frames; at most ${PET_ANIMS.length} rows, one per animation.` }
  if (width > MAX_SHEET_W) return { error: `The sheet has ${width / FRAME_W} frames in a row; at most ${MAX_FRAMES}.` }
  const keyOf = new Map<string, string>(), palette: Record<string, string> = {}
  const animations: PetFile['animations'] = {}
  for (let r = 0; r < height / FRAME_H; r++) {
    const anim = PET_ANIMS[r]!
    const frames: NonNullable<PetFile['animations'][PetAnimName]> = []
    for (let c = 0; c < width / FRAME_W; c++) {
      const px: string[] = []
      let any = false
      for (let y = 0; y < FRAME_H; y++) {
        let line = ''
        for (let x = 0; x < FRAME_W; x++) {
          const i = ((r * FRAME_H + y) * width + c * FRAME_W + x) * 4
          if (data[i + 3]! < 128) { line += '.'; continue }
          any = true
          const hex = '#' + hex2(data[i]!) + hex2(data[i + 1]!) + hex2(data[i + 2]!)
          let k = keyOf.get(hex)
          if (!k) {
            if (keyOf.size >= MAX_COLORS) return { error: `The sheet uses more than ${MAX_COLORS} colors; a pet has at most ${MAX_COLORS}.` }
            k = KEYS[keyOf.size]!
            keyOf.set(hex, k)
            palette[k] = hex
          }
          line += k
        }
        px.push(line)
      }
      if (!any) break
      frames.push({ px, ms: msFor(anim), ...(WALKS.includes(anim) && { dx: 1 }) })
    }
    if (frames.length) animations[anim] = frames
  }
  if (!animations.idle) return { error: 'The first row (idle) has no frames; idle is the one animation every pet needs.' }
  const file: PetFile = { format: 1, name, palette, animations: crop(animations) }
  try { validatePetFile(file) } catch (err) { return { error: (err as Error).message } }
  return { file }
}

// One box for every frame, so a hop keeps its height over the idle and a walk its stride:
// the pane then sizes the strip to the art, not to the 32 × 16 cell.
function crop(animations: PetFile['animations']): PetFile['animations'] {
  let x0 = FRAME_W, x1 = -1, y0 = FRAME_H, y1 = -1
  for (const frames of Object.values(animations)) for (const f of frames!) f.px.forEach((r, y) => [...r].forEach((k, x) => {
    if (k === '.') return
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
  }))
  const out: PetFile['animations'] = {}
  for (const [n, frames] of Object.entries(animations)) out[n as PetAnimName] = frames!.map(f => ({ ...f, px: f.px.slice(y0, y1 + 1).map(r => r.slice(x0, x1 + 1)) }))
  return out
}

export function retime(file: PetFile, speeds: Partial<Record<PetAnimName, number>>): PetFile {
  const animations: PetFile['animations'] = {}
  for (const n of PET_ANIMS) {
    const frames = file.animations[n]
    if (frames) animations[n] = speeds[n] === undefined ? frames : frames.map(f => ({ ...f, ms: msFor(n, speeds[n]) }))
  }
  return { ...file, animations }
}
