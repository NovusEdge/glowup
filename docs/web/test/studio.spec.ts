import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COLOR_KEYS, DEFAULT_SETUP, FIELD_KNOBS, resolveTheme, STUDIO_URL, PET_LINK_MAX, encodeLink, decodeLink, exportMix } from '../app/landing/data.ts'
import { packLook } from '../app/landing/look.ts'
import {
  COLOR_GROUPS, DEFAULT_STUDIO_SETUP, LINK_MAX, contrast, draftLook, draftProblems, editColors, editSetup, focusVars, fromHash,
  move, packJson, resetPet, sendCommand, setBaseTheme, setField, setGlyph, setHearts, setPetColor, setRole, setSurface, setWords, shareLink,
  startDraft, stateHash, toggle, petAddCommand, petOut, petPartSize, petProblems, petRides, type Draft, type StudioPet,
} from '../app/studio/model.ts'

const hashOf = (link: string) => link.slice(STUDIO_URL.length)

test('a draft from a built-in gets a name /glowup pack accepts and resolves to that pack', () => {
  const d = startDraft('cozy')
  assert.equal(d.name, 'my-cozy')
  assert.deepEqual(draftProblems(d), [])
  assert.equal(draftLook(d).look.theme.colors.accent, packLook('cozy').theme.colors.accent)
})

test('a draft named like a built-in still previews its own colors', () => {
  const d = setRole({ ...startDraft('cozy'), name: 'crt' }, 'accent', '#123456')!
  assert.equal(draftLook(d).look.theme.colors.accent, '#123456')
  assert.deepEqual(draftProblems(d), ['"crt" is a built-in pack name; pick another.'])
})

test('names the mod refuses are problems', () => {
  for (const name of ['My Pack', '', '-x', 'a'.repeat(41)])
    assert.match(draftProblems({ ...startDraft('classic'), name })[0]!, /lowercase letters, digits and dashes/)
})

test('a half-typed hex applies nothing; #rgb expands', () => {
  const d = startDraft('classic')
  assert.equal(setRole(d, 'read', '#ff'), undefined)
  assert.equal(setRole(d, 'read', 'red'), undefined)
  assert.equal(setRole(d, 'read', '#ABC')!.colors.palette!.read, '#aabbcc')
})

test('the share link carries the pack only and round-trips through fromHash', () => {
  const d = editColors(startDraft('arcade'), { rows: 'minimal' })
  const link = shareLink(d)
  assert.ok(link.startsWith(`${STUDIO_URL}#v=1&p=`))
  assert.ok(!link.includes('&s='))
  const back = fromHash(hashOf(link))
  assert.deepEqual(back.notices, [])
  assert.equal(back.draft!.name, d.name)
  assert.equal(back.draft!.colors.rows, 'minimal')
  assert.equal(back.setup, undefined)
})

test('the send command carries pack and setup', () => {
  const s = editSetup(DEFAULT_STUDIO_SETUP, { tabs: ['plan', 'changes'] }).setup
  const cmd = sendCommand(startDraft('crt'), s)
  assert.ok(cmd.startsWith(`/glowup pack ${STUDIO_URL}#v=1&p=`))
  assert.deepEqual(fromHash(hashOf(cmd.slice('/glowup pack '.length))).setup!.tabs, ['plan', 'changes'])
  assert.equal(stateHash(startDraft('crt'), s), hashOf(cmd.slice('/glowup pack '.length)))
})

test('the status line rides in the setup part only when edited away from the default', () => {
  const part = (cmd: string) => decodeLink(cmd.slice('/glowup pack '.length)).parts.setup as Record<string, unknown>
  const d = startDraft('crt')
  assert.ok(!('statusline' in part(sendCommand(d, DEFAULT_STUDIO_SETUP))))
  assert.equal(stateHash(d, DEFAULT_STUDIO_SETUP), hashOf(encodeLink({ pack: d, setup: DEFAULT_SETUP })))
  assert.deepEqual(fromHash(stateHash(d, DEFAULT_STUDIO_SETUP)).setup!.statusline, DEFAULT_STUDIO_SETUP.statusline)
  const edited = editSetup(DEFAULT_STUDIO_SETUP, { statusline: ['model', 'ctx'] }).setup
  assert.deepEqual(part(sendCommand(d, edited)).statusline, ['model', 'ctx'])
  assert.deepEqual(fromHash(stateHash(d, edited)).setup!.statusline, ['model', 'ctx'])
})

test('a pane link named after a built-in loads renamed, with the pane description kept', () => {
  const pane = encodeLink({ pack: exportMix(packLook('cozy'), 'cozy'), setup: DEFAULT_SETUP })
  const r = fromHash(hashOf(pane))
  assert.deepEqual(r.notices, [])
  assert.equal(r.draft!.name, 'my-cozy')
  assert.equal(r.draft!.description, 'cozy colors, cozy motion')
  assert.deepEqual(r.setup, DEFAULT_STUDIO_SETUP)
})

test('a broken pack part still loads the setup and names the pack part', () => {
  const link = encodeLink({ pack: { format: 1, name: 'x', colors: { rows: 'wavy' } }, setup: { meter: { warn: 40, danger: 90 } } })
  const r = fromHash(hashOf(link))
  assert.equal(r.draft, undefined)
  assert.equal(r.setup!.meter.warn, 40)
  assert.match(r.notices[0]!, /^pack part: colors\.rows must be one of/)
})

test('a newer or cut-off link gives a readable notice and no state', () => {
  assert.deepEqual(fromHash('#v=2&p=e30'), { notices: ['this link was made for a newer glowup'] })
  const cut = fromHash(hashOf(shareLink(startDraft('crt'))).slice(0, 40))
  assert.equal(cut.draft, undefined)
  assert.match(cut.notices[0]!, /^pack part:/)
  assert.deepEqual(fromHash(''), { notices: [] })
  assert.deepEqual(fromHash('#'), { notices: [] })
})

test('a pet part is reported, not dropped silently', () => {
  assert.match(fromHash(hashOf(encodeLink({ pet: { name: 'x' } }))).notices[0]!, /pet/)
})

test('packJson is the file /glowup pack would install', () => {
  const d = startDraft('crt')
  assert.deepEqual(JSON.parse(packJson(d)), d)
  assert.ok(packJson(d).endsWith('}\n'))
  assert.ok(shareLink(d).length < LINK_MAX)
})

test('contrast follows WCAG', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21)
  assert.equal(contrast('#777777', '#777777'), 1)
  assert.ok(contrast('#767676', '#ffffff') >= 4.5)
})

test('focusVars fades every role but the one hovered', () => {
  const look = packLook('classic')
  const v = focusVars(look, 'read')
  assert.equal(v['--read'], undefined)
  assert.notEqual(v['--edit'], look.theme.colors.edit)
  assert.equal(Object.keys(v).length, 13)
})

test('editSetup refuses what parseSetup would drop and keeps the old setup', () => {
  const r = editSetup(DEFAULT_STUDIO_SETUP, { tabs: [] })
  assert.equal(r.setup, DEFAULT_STUDIO_SETUP)
  assert.match(r.notice!, /tabs must name at least one/)
  assert.match(editSetup(DEFAULT_STUDIO_SETUP, { meter: { warn: 90, danger: 80 } }).notice!, /below/)
})

test('editSetup keeps the status line list and refuses an empty one', () => {
  assert.deepEqual(editSetup(DEFAULT_STUDIO_SETUP, { tabs: ['plan'] }).setup.statusline, DEFAULT_STUDIO_SETUP.statusline)
  assert.deepEqual(editSetup(DEFAULT_STUDIO_SETUP, { statusline: ['cost', 'model'] }).setup.statusline, ['cost', 'model'])
  const r = editSetup(DEFAULT_STUDIO_SETUP, { statusline: [] })
  assert.equal(r.setup, DEFAULT_STUDIO_SETUP)
  assert.equal(r.notice, 'status line needs at least one field')
})

test('status line fields travel in the setup part and unknown ids are reported', () => {
  const s = { ...DEFAULT_STUDIO_SETUP, statusline: ['model', 'ctx'] as typeof DEFAULT_STUDIO_SETUP.statusline }
  const back = fromHash(stateHash(startDraft('crt'), s))
  assert.deepEqual(back.setup!.statusline, ['model', 'ctx'])
  assert.deepEqual(back.notices, [])
  const odd = fromHash(hashOf(encodeLink({ pack: startDraft('crt'), setup: { statusline: ['model', 'nope', 'ctx'] } })))
  assert.deepEqual(odd.setup!.statusline, ['model', 'ctx'])
  assert.deepEqual(odd.notices, ['setup: unknown status line field "nope"'])
  assert.ok(sendCommand(startDraft('crt'), s).includes('/glowup pack '))
  assert.deepEqual(fromHash(hashOf(sendCommand(startDraft('crt'), s).slice('/glowup pack '.length))).setup!.statusline, ['model', 'ctx'])
})

test('switching the base theme swaps the palette and clears glyphs, hearts and words', () => {
  const d = setWords(setHearts(setGlyph(startDraft('arcade'), 'read', '»')!, '*', '-')!, 'A, B')!
  const n = setBaseTheme(d, 'aurora')
  assert.equal(n.colors.theme, 'aurora')
  assert.equal(n.colors.palette!.accent, resolveTheme('aurora', {}).theme.colors.accent)
  assert.notEqual(n.colors.palette!.accent, d.colors.palette!.accent)
  assert.equal(n.colors.glyphs, undefined)
  assert.equal(n.colors.hearts, undefined)
  assert.equal(n.colors.words, undefined)
  assert.deepEqual(draftProblems(n), [])
  const crt = setBaseTheme(startDraft('crt'), 'aurora')
  const t = resolveTheme('aurora', {}).theme.colors
  assert.equal(crt.colors.bg, undefined)
  assert.equal(crt.colors.borderColor, undefined)
  assert.equal(draftLook(crt).look.bg, t.panel)
  assert.equal(draftLook(crt).look.borderColor, t.faint)
})

test('setSurface takes a whole hex only', () => {
  const d = startDraft('classic')
  assert.equal(setSurface(d, 'bg', '#12'), undefined)
  assert.equal(setSurface(d, 'bg', '#ABC')!.colors.bg, '#aabbcc')
  assert.equal(setSurface(d, 'borderColor', '#123456')!.colors.borderColor, '#123456')
})

test('setField clamps knobs and both ends of every knob are valid', () => {
  const d = startDraft('crt')
  const f = (n: Draft) => n.motion.field as Record<string, unknown>
  assert.equal(f(setField(d, { speed: 99 }))['speed'], FIELD_KNOBS.speed[1])
  assert.equal(f(setField(d, { scale: 0 }))['scale'], FIELD_KNOBS.scale[0])
  assert.equal(f(setField(d, { size: 2.6 }))['size'], 3)
  assert.equal(f(setField(d, { speed: NaN }))['speed'], f(setField(d, {}))['speed'])
  for (const [k, [lo, hi]] of Object.entries(FIELD_KNOBS))
    for (const v of [lo, hi]) assert.deepEqual(draftProblems(setField(d, { [k]: v })), [], `${k}=${v}`)
  const str = setField({ ...d, motion: { ...(d.motion as object), field: 'simplex' as const } }, { speed: 2 })
  assert.equal(f(str)['shape'], 'simplex')
  assert.equal(f(str)['speed'], 2)
  assert.equal(f(str)['fps'], 10)
})

test('glyphs, hearts and words apply only when the mod would accept them', () => {
  const d = startDraft('classic')
  assert.equal(setGlyph(d, 'read', 'ab'), undefined)
  const g = setGlyph(d, 'read', '»')!
  assert.equal(draftLook(g).look.theme.glyphs.read, '»')
  assert.equal(setHearts(d, 'ab', '-'), undefined)
  assert.deepEqual(setHearts(d, '*', '-')!.colors.hearts, ['*', '-'])
  assert.deepEqual(setWords(d, ' Brewing, , Stirring ')!.colors.words, ['Brewing', 'Stirring'])
  assert.equal(setWords(d, ' , '), undefined)
})

test('Clawd colors follow the body until light or shade is set by hand', () => {
  const d = startDraft('classic')
  assert.equal(setPetColor(d, 'body', '#ff'), undefined)
  const a = setPetColor(d, 'body', '#c0392b')!
  assert.equal(a.colors.pet!.body, '#c0392b')
  assert.ok(a.colors.pet!.light && a.colors.pet!.shade)
  const b = setPetColor(a, 'body', '#2980b9')!
  assert.notEqual(b.colors.pet!.light, a.colors.pet!.light)
  const hand = setPetColor(b, 'light', '#ffffff')!
  const c = setPetColor(hand, 'body', '#27ae60')!
  assert.equal(c.colors.pet!.light, '#ffffff')
  assert.notEqual(c.colors.pet!.shade, b.colors.pet!.shade)
  assert.deepEqual(draftProblems(c), [])
  assert.equal(resetPet(c).colors.pet, undefined)
})

test('color groups name every drawn role once, then Clawd', () => {
  assert.deepEqual(COLOR_GROUPS.map(g => g.name), ['Text', 'Tool rows', 'Results', 'Surfaces', 'Clawd'])
  const roles = COLOR_GROUPS.flatMap(g => g.items.flatMap(i => ('role' in i ? [i.role] : [])))
  assert.equal(new Set(roles).size, roles.length)
  assert.ok(!roles.some(r => ['addBg', 'delBg', 'sel'].includes(r)))
  const want = [...COLOR_KEYS.filter(k => !['addBg', 'delBg', 'sel'].includes(k)), 'bg', 'borderColor']
  assert.deepEqual([...roles].sort(), want.sort())
  assert.deepEqual(COLOR_GROUPS[4]!.items.map(i => i.label), ['Body', 'Light', 'Shade'])
})

test('move and toggle', () => {
  assert.deepEqual(move(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c'])
  assert.deepEqual(move(['a', 'b'], 0, -1), ['a', 'b'])
  assert.deepEqual(toggle(['a', 'b'], 'a'), ['b'])
  assert.deepEqual(toggle(['b'], 'a'), ['b', 'a'])
})

const tinyPet = (name = 'mochi') => ({ format: 1 as const, name, palette: { A: '#112233' }, animations: { idle: [{ ms: 400, px: Array(12).fill('A'.repeat(24)) }] } })
const bigPet = () => ({ ...tinyPet('chonk'), animations: { idle: Array(32).fill(0).map((_, i) => ({ ms: 400, px: Array(12).fill(String.fromCharCode(65 + (i % 26)).repeat(24)) })) }, palette: Object.fromEntries([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((k, i) => [k, `#${i.toString(16).padStart(2, '0')}0000`])) })

test('a small pet rides in the send command and the page hash; the share link never carries it', () => {
  const d = startDraft('classic'), pet = tinyPet()
  assert.ok(petRides(pet))
  assert.match(sendCommand(d, DEFAULT_STUDIO_SETUP, pet), /&pet=/)
  assert.deepEqual(fromHash(stateHash(d, DEFAULT_STUDIO_SETUP, pet)).pet?.file, pet)
  assert.doesNotMatch(shareLink(d), /pet=/)
})

test('a pet over 4 KB encoded stays out of links', () => {
  const pet = bigPet()
  assert.ok(petPartSize(pet) > PET_LINK_MAX)
  assert.equal(petRides(pet), false)
  assert.doesNotMatch(sendCommand(startDraft('classic'), DEFAULT_STUDIO_SETUP, pet), /pet=/)
  assert.equal(petAddCommand(pet), '/glowup pet add ~/Downloads/chonk.json')
})

test('a bad pet name is a problem and keeps the pet out of links', () => {
  const pet = tinyPet('robot')
  assert.deepEqual(petProblems(pet), ['"robot" is a built-in pet name; pick another.'])
  assert.equal(petRides(pet), false)
})

test('petOut applies the speeds', () => {
  const p: StudioPet = { file: tinyPet(), speeds: { idle: 2 } }
  assert.equal(petOut(p).animations.idle![0]!.ms, 200)
})

test('a link pet that fails validation becomes a notice', () => {
  const hash = hashOf(encodeLink({ pet: { ...tinyPet(), palette: {} } }))
  const r = fromHash(hash)
  assert.equal(r.pet, undefined)
  assert.deepEqual(r.notices, ['pet part: the palette needs at least one color'])
})
