import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETUP, STUDIO_URL, encodeLink, exportMix } from '../app/landing/data.ts'
import { packLook } from '../app/landing/look.ts'
import {
  LINK_MAX, contrast, draftLook, draftProblems, editColors, editSetup, focusVars, fromHash, move, packJson,
  sendCommand, setRole, shareLink, startDraft, stateHash, toggle,
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
  const s = editSetup(DEFAULT_SETUP, { tabs: ['plan', 'changes'] }).setup
  const cmd = sendCommand(startDraft('crt'), s)
  assert.ok(cmd.startsWith(`/glowup pack ${STUDIO_URL}#v=1&p=`))
  assert.deepEqual(fromHash(hashOf(cmd.slice('/glowup pack '.length))).setup!.tabs, ['plan', 'changes'])
  assert.equal(stateHash(startDraft('crt'), s), hashOf(cmd.slice('/glowup pack '.length)))
})

test('a pane link named after a built-in loads renamed, with the pane description kept', () => {
  const pane = encodeLink({ pack: exportMix(packLook('cozy'), 'cozy'), setup: DEFAULT_SETUP })
  const r = fromHash(hashOf(pane))
  assert.deepEqual(r.notices, [])
  assert.equal(r.draft!.name, 'my-cozy')
  assert.equal(r.draft!.description, 'cozy colors, cozy motion')
  assert.deepEqual(r.setup, DEFAULT_SETUP)
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
  const r = editSetup(DEFAULT_SETUP, { tabs: [] })
  assert.equal(r.setup, DEFAULT_SETUP)
  assert.match(r.notice!, /tabs must name at least one/)
  assert.match(editSetup(DEFAULT_SETUP, { meter: { warn: 90, danger: 80 } }).notice!, /below/)
})

test('move and toggle', () => {
  assert.deepEqual(move(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c'])
  assert.deepEqual(move(['a', 'b'], 0, -1), ['a', 'b'])
  assert.deepEqual(toggle(['a', 'b'], 'a'), ['b'])
  assert.deepEqual(toggle(['b'], 'a'), ['b', 'a'])
})
