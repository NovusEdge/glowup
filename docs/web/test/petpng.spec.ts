import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CLAWD_SHEET, PET_ANIMS, ANIM_MS, validatePetFile, petSheet } from '../app/landing/data.ts'
import { petFromPixels, retime, msFor, type Pixels } from '../app/studio/petpng.ts'
import { decodePng } from './png.ts'

const colors = (px: string[], pal: Record<string, string>) => px.map(r => [...r].map(k => (k === '.' ? '.' : pal[k])).join(','))

// Frames cut to the smallest box holding every opaque pixel of every frame: what the converter does.
function cropAll(frames: string[][]): string[][] {
  let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1
  for (const px of frames) px.forEach((r, y) => [...r].forEach((k, x) => { if (k !== '.') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) } }))
  return frames.map(px => px.slice(y0, y1 + 1).map(r => [...r].slice(x0, x1 + 1).join('')))
}

// A blank sheet of cols × rows 32 × 16 cells; paint(x, y, [r,g,b,a]) sets one pixel.
function sheet(cols: number, rows: number) {
  const width = cols * 32, height = rows * 16, data = new Uint8Array(width * height * 4)
  const paint = (x: number, y: number, c: number[]) => data.set(c, (y * width + x) * 4)
  return { img: { width, height, data } as Pixels, paint }
}

test('the template PNG decodes back to Clawd, frame for frame', () => {
  const img = decodePng(readFileSync(new URL('../../assets/pet-template.png', import.meta.url)))
  assert.deepEqual([img.width, img.height], [448, 192])
  const r = petFromPixels(img, 'clawd-copy')
  assert.ok('file' in r, 'error' in r ? r.error : '')
  const used = PET_ANIMS.flatMap(n => CLAWD_SHEET.animations[n]!.frames.map(f => f.px))
  const want = cropAll(used)
  const got = PET_ANIMS.flatMap(n => r.file.animations[n]!.map(f => colors(f.px, r.file.palette)))
  assert.deepEqual(got, want.map(px => colors(px, CLAWD_SHEET.palette)))
  for (const n of PET_ANIMS) {
    assert.equal(r.file.animations[n]!.length, CLAWD_SHEET.animations[n]!.frames.length, n)
    assert.ok(r.file.animations[n]!.every(f => f.ms === ANIM_MS[n]), n)
  }
  assert.ok(r.file.animations.walk!.every(f => f.dx === 1))
  assert.ok(r.file.animations.idle!.every(f => f.dx === undefined))
})

test('frames are trimmed to the box every frame shares, so poses keep their offsets', () => {
  const { img, paint } = sheet(2, 1)
  paint(5, 10, [1, 1, 1, 255])
  paint(32 + 7, 3, [1, 1, 1, 255])
  const r = petFromPixels(img)
  assert.ok('file' in r)
  assert.deepEqual(r.file.animations.idle!.map(f => f.px), [
    ['...', '...', '...', '...', '...', '...', '...', 'A..'],
    ['..A', '...', '...', '...', '...', '...', '...', '...'],
  ])
})

test('the result is a valid pet file and a playable sheet', () => {
  const { img, paint } = sheet(1, 1)
  paint(0, 0, [255, 0, 0, 255])
  const r = petFromPixels(img, 'dot')
  assert.ok('file' in r)
  validatePetFile(r.file)
  assert.deepEqual([petSheet(r.file).w, petSheet(r.file).h], [1, 1])
})

test('alpha below half is transparent; half and above keeps its color', () => {
  const { img, paint } = sheet(1, 1)
  paint(0, 0, [10, 20, 30, 127]); paint(1, 0, [10, 20, 30, 128])
  const r = petFromPixels(img)
  assert.ok('file' in r)
  assert.deepEqual(r.file.animations.idle![0]!.px, ['A'])
  assert.deepEqual(r.file.palette, { A: '#0a141e' })
})

test('the first fully transparent cell ends a row; later rows are separate animations', () => {
  const { img, paint } = sheet(3, 2)
  paint(0, 0, [1, 1, 1, 255]); paint(64, 0, [2, 2, 2, 255])
  paint(0, 16, [3, 3, 3, 255])
  const r = petFromPixels(img)
  assert.ok('file' in r)
  assert.equal(r.file.animations.idle!.length, 1)
  assert.equal(r.file.animations.walk!.length, 1)
  assert.equal(r.file.animations.walk![0]!.dx, 1)
})

test('refusals: no idle, too many colors, sizes off the grid or too big', () => {
  const empty = sheet(1, 2)
  empty.paint(0, 16, [1, 1, 1, 255])
  assert.match((petFromPixels(empty.img) as { error: string }).error, /idle/)
  const many = sheet(1, 1)
  for (let i = 0; i < 61; i++) many.paint(i % 32, Math.floor(i / 32), [i, 0, 0, 255])
  assert.match((petFromPixels(many.img) as { error: string }).error, /more than 60 colors/)
  assert.match((petFromPixels({ width: 33, height: 16, data: new Uint8Array(33 * 16 * 4) }) as { error: string }).error, /whole number of 32 × 16/)
  assert.match((petFromPixels({ width: 32, height: 208, data: new Uint8Array(32 * 208 * 4) }) as { error: string }).error, /at most 12 rows/)
})

test('the 60-color cap counts only opaque colors', () => {
  const { img, paint } = sheet(1, 1)
  for (let i = 0; i < 60; i++) paint(i % 32, Math.floor(i / 32), [i, 0, 0, 255])
  paint(31, 1, [200, 200, 200, 127])
  const r = petFromPixels(img)
  assert.ok('file' in r, 'error' in r ? r.error : '')
  assert.equal(Object.keys(r.file.palette).length, 60)
  assert.equal(r.file.animations.idle![0]!.px[1]![31], '.')
})

test('a speed scales one row and never drops under 80 ms', () => {
  assert.equal(msFor('walk', 2), 80)
  assert.equal(msFor('sleep', 0.5), 900)
  const { img, paint } = sheet(1, 1)
  paint(0, 0, [9, 9, 9, 255])
  const r = petFromPixels(img)
  assert.ok('file' in r)
  assert.equal(retime(r.file, { idle: 2 }).animations.idle![0]!.ms, 200)
  assert.equal(r.file.animations.idle![0]!.ms, 400)
})
