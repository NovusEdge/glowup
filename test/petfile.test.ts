import { test, expect } from 'claude-code/testing'
import { validatePetFile, petSheet, petNameProblem, PET_ANIMS, ANIM_MS, ONCE, BUILTIN_PET_NAMES, builtinPets, type PetFile } from '../hooks/petfile.ts'
import { validateSheet, BUILTIN_SHEETS } from '../hooks/pets.ts'

const row = (s: string) => s.padEnd(24, '.')
const frame = (k = 'A', ms = 400) => ({ ms, px: [...Array(11).fill(row('')), row(k.repeat(4))] })
const pet = (over: Partial<PetFile> = {}): PetFile => ({ format: 1, name: 'mochi', palette: { A: '#112233' }, animations: { idle: [frame()] }, ...over })
const refuses = (file: unknown, msg: RegExp) => expect(() => validatePetFile(file)).toThrow(msg)

test('a minimal pet with only idle is valid and becomes a sheet the player accepts', () => {
  const f = pet()
  validatePetFile(f)
  const s = petSheet(f)
  expect([s.w, s.h]).toEqual([24, 12])
  expect(s.animations.idle!.loop).toBe(true)
  expect(() => validateSheet(s)).not.toThrow()
})

test('hop, fail and scrunch play once; the rest loop', () => {
  const animations = Object.fromEntries(PET_ANIMS.map(n => [n, [frame()]]))
  const s = petSheet(pet({ animations }))
  for (const n of PET_ANIMS) expect(s.animations[n]!.loop).toBe(!ONCE.includes(n))
  expect([...ONCE].sort()).toEqual(['fail', 'hop', 'scrunch'])
})

test('default frame times follow Clawd and never flash', () => {
  for (const n of PET_ANIMS) expect(ANIM_MS[n]).toBeGreaterThanOrEqual(80)
  expect(ANIM_MS.walk).toBe(110)
  expect(ANIM_MS.sleep).toBe(450)
})

test('smaller art is allowed when every frame shares the size of the first idle frame', () => {
  const small = { ms: 200, px: ['AA..', '.AA.'] }
  validatePetFile(pet({ animations: { idle: [small], walk: [{ ...small, dx: 1 }] } }))
  expect(petSheet(pet({ animations: { idle: [small] } })).w).toBe(4)
  refuses(pet({ animations: { idle: [small], walk: [{ ms: 200, px: ['AAA', 'AAA'] }] } }), /walk\[0\]: a row is 3 wide, want 4/)
})

test('top-level shape: object, format, name, known keys', () => {
  refuses([], /a pet must be a JSON object/)
  refuses({ ...pet(), format: 3 }, /made for a newer glowup/)
  refuses({ ...pet(), format: undefined }, /"format": 1 is missing/)
  refuses({ ...pet(), hats: {} }, /unknown key "hats"/)
  refuses(pet({ name: 'My Pet' }), /lowercase letters, digits and dashes/)
  refuses(pet({ description: 'x'.repeat(81) }), /description/)
})

test('the built-in names and the built-in sheets list the same pets', () => {
  expect(Object.keys(BUILTIN_SHEETS).sort()).toEqual([...BUILTIN_PET_NAMES].sort())
  expect(builtinPets(false, false)).toEqual(['clawd', 'robot'])
  expect(builtinPets(true, true)).toEqual(['clawd', 'clawd-shiny', 'robot', 'egg'])
  expect(petNameProblem('egg')).toMatch(/built-in pet name/)
})

test('reserved names: built-ins and pet subcommands', () => {
  for (const n of ['clawd', 'clawd-shiny', 'robot', 'egg', 'off', 'list', 'add']) expect(petNameProblem(n)).toMatch(/built-in pet name|pet command/)
  expect(petNameProblem('mochi')).toBeUndefined()
})

test('palette: 1 to 60 single printable characters, #rrggbb colors, no "."', () => {
  refuses(pet({ palette: {} }), /palette needs at least one color/)
  refuses(pet({ palette: { '.': '#000000' } }), /palette key "." is reserved/)
  refuses(pet({ palette: { AB: '#000000' } }), /palette keys are single characters/)
  refuses(pet({ palette: { '𝐀': '#000000' } }), /palette key "𝐀" is above U\+FFFF/)
  refuses(pet({ palette: { '𝐀B': '#000000' } }), /palette keys are single characters/)
  refuses(pet({ palette: { A: 'red' } }), /palette color "A" must be #rrggbb/)
  const many = Object.fromEntries([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'].slice(0, 61).map(k => [k, '#000000']))
  refuses(pet({ palette: many }), /at most 60 colors/)
})

test('animations: idle required, known names only, no left-facing or outfit keys', () => {
  refuses(pet({ animations: {} }), /needs an idle animation/)
  refuses(pet({ animations: { idle: [] } }), /idle needs at least one frame/)
  refuses(pet({ animations: { idle: [frame()], 'walk-left': [frame()] } as never }), /unknown animation "walk-left"/)
  refuses(pet({ animations: { idle: Array(33).fill(frame()) } }), /idle has 33 frames; at most 32/)
})

test('frames: size cap, palette keys, ms range, dx and exit types', () => {
  refuses(pet({ animations: { idle: [{ ms: 400, px: Array(17).fill(row('')) }] } }), /idle\[0\]: 17 pixel rows; at most 16/)
  refuses(pet({ animations: { idle: [{ ms: 400, px: [row('').repeat(2)] }] } }), /idle\[0\]: 48 wide; at most 32/)
  validatePetFile(pet({ animations: { idle: [{ ms: 400, px: Array(16).fill('A'.repeat(32)) }] } }))
  refuses(pet({ animations: { idle: [frame('Q')] } }), /idle\[0\]: unknown palette key "Q"/)
  refuses(pet({ animations: { idle: [frame('A', 50)] } }), /idle\[0\]: ms must be a whole number from 80 to 10000/)
  refuses(pet({ animations: { idle: [{ ...frame(), dx: 0.5 }] } }), /idle\[0\]: dx must be a whole number from -4 to 4/)
  refuses(pet({ animations: { idle: [{ ...frame(), exit: 'yes' }] } as never }), /idle\[0\]: exit must be true or false/)
  refuses(pet({ animations: { idle: [{ ...frame(), head: [1, 1] }] } as never }), /idle\[0\]: unknown key "head"/)
})

const base = pet()
const v2 = (extra: object) => ({ ...pet(), format: 2, ...extra })

test('format 2 takes lines and a voice, and the sheet carries them', () => {
  const file = v2({ lines: { done: ['yay {file}'], 'hello@night': ['zz'] }, voice: 'a sleepy blob' })
  validatePetFile(file)
  const sheet = petSheet(file as never)
  expect(sheet.lines).toEqual({ done: ['yay {file}'], 'hello@night': ['zz'] })
  expect(sheet.voice).toBe('a sleepy blob')
})

test('level keys are accepted from 2 to 99, alone or with a flavour', () => {
  const ok = (lines: unknown) => () => validatePetFile(v2({ lines }))
  expect(ok({ 'done@lv2': ['x'], 'done@lv99': ['x'], 'hello@night@lv4': ['x'], 'level-up': ['up: {unlock}'], 'level-up@lv3': ['x'] })).not.toThrow()
  for (const k of ['done@lv1', 'done@lv100', 'done@lvx', 'done@lv02', 'done@lv4@night', 'done@lv', 'done@night@lv4@lv5']) {
    expect(ok({ [k]: ['x'] })).toThrow(`"${k}"`)
  }
})

test('lines or voice under format 1 point at format 2', () => {
  expect(() => validatePetFile({ ...base, lines: { done: ['x'] } })).toThrow('"lines" and "voice" need "format": 2')
  expect(() => validatePetFile({ ...base, voice: 'x' })).toThrow('"lines" and "voice" need "format": 2')
})

test('format 2 without lines or voice is still a valid pet; format 3 is newer', () => {
  validatePetFile(v2({}))
  expect(() => validatePetFile({ ...base, format: 3 })).toThrow('made for a newer glowup (format 3)')
})

test('bad lines are refused with the key named', () => {
  const bad = (lines: unknown) => () => validatePetFile(v2({ lines }))
  expect(bad({ dance: ['x'] })).toThrow('lines: unknown moment "dance"')
  expect(bad({ 'done@noon': ['x'] })).toThrow('lines: unknown flavour "noon" in "done@noon"')
  expect(bad({ hello: ['hi {file}'] })).toThrow('lines.hello[0]: hello lines cannot use {file}')
  expect(bad({ done: ['x'.repeat(41)] })).toThrow('lines.done[0]: at most 40 characters')
  expect(bad({ done: Array(13).fill('x') })).toThrow('lines.done: 1 to 12 lines')
  expect(bad({ done: [] })).toThrow('lines.done: 1 to 12 lines')
  expect(bad({ done: ['a\u001bb'] })).toThrow('lines.done[0]: printable text only')
  expect(bad(['x'])).toThrow('"lines" must be an object')
})

test('a voice is printable and at most 120 characters', () => {
  expect(() => validatePetFile(v2({ voice: 'x'.repeat(121) }))).toThrow('"voice" must be printable text of at most 120 characters')
  expect(() => validatePetFile(v2({ voice: 'a‮b' }))).toThrow('"voice" must be printable text of at most 120 characters')
})
