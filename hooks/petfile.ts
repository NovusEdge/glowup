// JSX-free: the studio imports it.
import { isPlain, isUnsafe, shown } from './themes.ts'
import { SAFE_NAME } from './packs.ts'
import type { PetSheet } from './pets.ts'

// The sprite spec's rows, top to bottom, and the only animation names a pet file may use.
export const PET_ANIMS = ['idle', 'walk', 'working', 'hop', 'alert', 'done', 'sleep', 'fail', 'juggle', 'pant', 'pant-walk', 'scrunch'] as const
export type PetAnimName = (typeof PET_ANIMS)[number]
// The largest frame, and the cell size of a PNG sheet. Clawd is 24 × 12; the robot uses it all.
export const FRAME_W = 32, FRAME_H = 16
export const MAX_COLORS = 60, MAX_FRAMES = 32
// The pets page promises no frame changes faster than every 80 ms.
export const MIN_MS = 80, MAX_MS = 10_000
// One frame time per row, at Clawd's pace; the studio's speed slider scales it.
export const ANIM_MS: Record<PetAnimName, number> = { idle: 400, walk: 110, working: 120, hop: 120, alert: 180, done: 120, sleep: 450, fail: 250, juggle: 110, pant: 290, 'pant-walk': 140, scrunch: 150 }
export const ONCE: readonly PetAnimName[] = ['hop', 'fail', 'scrunch']
export const WALKS: readonly PetAnimName[] = ['walk', 'pant-walk']
// Every place that lists the built-ins derives from this; BUILTIN_SHEETS in pets.ts must have the same keys (a test checks).
export const BUILTIN_PET_NAMES = ['clawd', 'clawd-shiny', 'robot', 'egg']
export const builtinPets = (shiny: boolean, egg: boolean) => BUILTIN_PET_NAMES.filter(n => (shiny || n !== 'clawd-shiny') && (egg || n !== 'egg'))
const COMMANDS = ['off', 'list', 'add']

export type PetFileFrame = { px: string[]; ms: number; dx?: number; exit?: boolean }
export type PetFile = { format: 1; name: string; description?: string; palette: Record<string, string>; animations: Partial<Record<PetAnimName, PetFileFrame[]>> }

const FILE_KEYS = ['format', 'name', 'description', 'palette', 'animations']
const FRAME_KEYS = ['px', 'ms', 'dx', 'exit']
const HEX = /^#[0-9a-fA-F]{6}$/
const printable = (s: string) => [...s].every(c => !isUnsafe(c.codePointAt(0)!))
const whole = (n: unknown, lo: number, hi: number) => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi

export function petNameProblem(name: string): string | undefined {
  if (!SAFE_NAME.test(name)) return 'A pet needs a "name" of lowercase letters, digits and dashes.'
  if (BUILTIN_PET_NAMES.includes(name)) return `"${name}" is a built-in pet name; pick another.`
  if (COMMANDS.includes(name)) return `"${name}" is a pet command; pick another name.`
  return undefined
}

export function validatePetFile(file: unknown): asserts file is PetFile {
  if (!isPlain(file)) throw new Error('a pet must be a JSON object')
  for (const k of Object.keys(file)) if (!FILE_KEYS.includes(k)) throw new Error(`unknown key "${shown(k)}"`)
  const fmt = file.format
  if (fmt === undefined || (typeof fmt === 'number' && fmt < 1)) throw new Error('"format": 1 is missing')
  if (typeof fmt !== 'number' || !Number.isInteger(fmt)) throw new Error('"format" must be a whole number')
  if (fmt > 1) throw new Error(`made for a newer glowup (format ${fmt})`)
  const name = typeof file.name === 'string' ? file.name : ''
  const problem = petNameProblem(name)
  if (problem) throw new Error(problem)
  const d = file.description
  if (d !== undefined && !(typeof d === 'string' && d.length <= 80 && printable(d))) throw new Error('"description" must be printable text of at most 80 characters')

  const pal = file.palette
  if (!isPlain(pal)) throw new Error('"palette" must be an object of single-character keys and #rrggbb colors')
  const keys = Object.keys(pal)
  if (!keys.length) throw new Error('the palette needs at least one color')
  if (keys.length > MAX_COLORS) throw new Error(`the palette has ${keys.length} colors; at most ${MAX_COLORS} colors are allowed`)
  for (const k of keys) {
    if (k === '.') throw new Error('palette key "." is reserved for transparent pixels')
    if ([...k].length !== 1 || !printable(k) || k.trim() !== k) throw new Error('palette keys are single characters')
    if (k.codePointAt(0)! > 0xffff) throw new Error(`palette key "${shown(k)}" is above U+FFFF; use a letter, digit or symbol from the basic plane`)
    if (typeof pal[k] !== 'string' || !HEX.test(pal[k] as string)) throw new Error(`palette color "${shown(k)}" must be #rrggbb`)
  }

  const anims = file.animations
  if (!isPlain(anims)) throw new Error('"animations" must be an object')
  for (const n of Object.keys(anims)) if (!(PET_ANIMS as readonly string[]).includes(n)) throw new Error(`unknown animation "${shown(n)}"; known: ${PET_ANIMS.join(', ')}`)
  if (anims.idle === undefined) throw new Error('a pet needs an idle animation')
  let size: [number, number] | undefined
  for (const n of PET_ANIMS) {
    const frames = anims[n]
    if (frames === undefined) continue
    if (!Array.isArray(frames) || !frames.length) throw new Error(`${n} needs at least one frame`)
    if (frames.length > MAX_FRAMES) throw new Error(`${n} has ${frames.length} frames; at most ${MAX_FRAMES}`)
    frames.forEach((f: unknown, i) => {
      const at = `${n}[${i}]`
      if (!isPlain(f)) throw new Error(`${at}: a frame must be an object with px and ms`)
      for (const k of Object.keys(f)) if (!FRAME_KEYS.includes(k)) throw new Error(`${at}: unknown key "${shown(k)}"`)
      if (!whole(f.ms, MIN_MS, MAX_MS)) throw new Error(`${at}: ms must be a whole number from ${MIN_MS} to ${MAX_MS}`)
      if (f.dx !== undefined && !whole(f.dx, -4, 4)) throw new Error(`${at}: dx must be a whole number from -4 to 4`)
      if (f.exit !== undefined && typeof f.exit !== 'boolean') throw new Error(`${at}: exit must be true or false`)
      const px = f.px
      if (!Array.isArray(px) || !px.length || !px.every(r => typeof r === 'string')) throw new Error(`${at}: px must be a list of pixel rows`)
      if (px.length > FRAME_H) throw new Error(`${at}: ${px.length} pixel rows; at most ${FRAME_H}`)
      const w = [...(px[0] as string)].length
      if (w < 1 || w > FRAME_W) throw new Error(`${at}: ${w} wide; at most ${FRAME_W}`)
      size ??= [w, px.length]
      if (px.length !== size[1]) throw new Error(`${at}: ${px.length} pixel rows, want ${size[1]}`)
      for (const r of px as string[]) {
        if ([...r].length !== size[0]) throw new Error(`${at}: a row is ${[...r].length} wide, want ${size[0]}`)
        for (const c of r) if (c !== '.' && !(c in pal)) throw new Error(`${at}: unknown palette key "${shown(c)}"`)
      }
    })
  }
}

export function petSheet(file: PetFile): PetSheet {
  const first = file.animations.idle![0]!
  const animations: PetSheet['animations'] = {}
  for (const n of PET_ANIMS) {
    const frames = file.animations[n]
    if (frames) animations[n] = { loop: !ONCE.includes(n), frames: frames.map(f => ({ ...f, px: [...f.px] })) }
  }
  return { w: [...first.px[0]!].length, h: first.px.length, palette: { ...file.palette }, animations }
}
