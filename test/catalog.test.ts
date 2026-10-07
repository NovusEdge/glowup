import { test, expect } from 'claude-code/testing'
import { fakeHost } from './kit.ts'
import { parseCatalog, compareVersions, canRun, loadCatalog, refreshCatalog, CATALOG_URL, CATALOG_FILE, installEntry, loadRecord, textHash, RECORD_FILE, type CatalogEntry } from '../hooks/catalog.ts'

const OXIDE = { name: 'oxide', description: 'bone text and red oxide on warm ink', pack: 'https://example.com/oxide.json', themes: ['https://example.com/themes/oxide.json'], minGlowup: '0.8.1' }
const index = (packs: unknown[], format = 1) => ({ format, packs })

test('a valid index gives its entries', async () => {
  expect(parseCatalog(index([OXIDE]))).toEqual({ entries: [OXIDE], errors: [] })
})

test('a non-object, a missing packs array or another format is no index', async () => {
  for (const bad of [null, [], 'x', { format: 1 }, index([OXIDE], 2), { packs: [OXIDE] }]) expect(parseCatalog(bad)).toBeUndefined()
})

test('bad entries are dropped one by one, the rest kept', async () => {
  const r = parseCatalog(index([
    OXIDE,
    { ...OXIDE, name: 'Bad Name' },
    { ...OXIDE, name: 'classic' },
    { ...OXIDE, name: 'update' },
    { ...OXIDE, name: 'plain', pack: 'http://example.com/p.json' },
    { ...OXIDE, name: 'long', description: 'x'.repeat(81) },
    { ...OXIDE, name: 'nover', minGlowup: undefined },
    { ...OXIDE, name: 'badtheme', themes: ['ftp://x'] },
  ]))!
  expect(r.entries.map(e => e.name)).toEqual(['oxide'])
  expect(r.errors.length).toBe(7)
})

test('unknown entry keys are ignored and themes default to empty', async () => {
  const { themes: _, ...noThemes } = OXIDE
  expect(parseCatalog(index([{ ...noThemes, preview: 'x' }]))!.entries).toEqual([{ ...noThemes, themes: [] }])
})

test('a repeated name keeps the first entry', async () => {
  const r = parseCatalog(index([OXIDE, { ...OXIDE, description: 'second' }]))!
  expect(r.entries).toEqual([OXIDE])
  expect(r.errors.length).toBe(1)
})

test('at most 100 entries are read', async () => {
  const many = Array.from({ length: 120 }, (_, i) => ({ ...OXIDE, name: `p${i}` }))
  expect(parseCatalog(index(many))!.entries.length).toBe(100)
})

test('versions compare per dotted number', async () => {
  expect(compareVersions('0.9.0', '0.10.0')).toBeLessThan(0)
  expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0)
  expect(compareVersions('1.0', '1.0.0')).toBe(0)
})

test('an entry runs only on a glowup at least its minGlowup', async () => {
  const e: CatalogEntry = { ...OXIDE, minGlowup: '0.10.0' }
  expect([canRun(e, '0.10.0'), canRun(e, '0.10.1'), canRun(e, '0.9.0'), canRun(e, undefined), canRun(e, 'dev')]).toEqual([true, true, false, false, false])
})

test('refresh writes a valid index to the cache and returns it', async () => {
  const text = JSON.stringify(index([OXIDE]))
  const { host, files } = fakeHost({ fetches: { [CATALOG_URL]: text } })
  expect(await refreshCatalog(host)).toEqual([OXIDE])
  expect(files[CATALOG_FILE(host.configDir)]).toBe(text)
  expect(await loadCatalog(host)).toEqual([OXIDE])
})

test('a failed or invalid fetch leaves the cache', async () => {
  const cached = JSON.stringify(index([OXIDE]))
  for (const fetches of [{} as Record<string, string>, { [CATALOG_URL]: 'not json' }, { [CATALOG_URL]: JSON.stringify(index([OXIDE], 9)) }]) {
    const { host, files } = fakeHost({ fetches, files: { [CATALOG_FILE('/home/u/.claude')]: cached } })
    expect(await refreshCatalog(host)).toBeUndefined()
    expect(files[CATALOG_FILE(host.configDir)]).toBe(cached)
  }
})

test('a thrown fetch is a failed refresh, not an error', async () => {
  const { host } = fakeHost()
  host.fetchText = async () => { throw new Error('timed out after 10 s') }
  expect(await refreshCatalog(host)).toBeUndefined()
})

test('no cache, or a broken one, loads as an empty catalog', async () => {
  expect(await loadCatalog(fakeHost().host)).toEqual([])
  expect(await loadCatalog(fakeHost({ files: { [CATALOG_FILE('/home/u/.claude')]: '{' } }).host)).toEqual([])
})

const PACK = (name: string, extra: Record<string, unknown> = {}) => JSON.stringify({ format: 1, name, colors: { theme: 'oxide' }, ...extra })
const THEME = JSON.stringify({ name: 'oxide', extends: 'classic' })
const PACKS_DIR = '/home/u/.claude/glowup/packs', THEMES_DIR = '/home/u/.claude/glowup/themes'
const fetchesFor = (pack = PACK('oxide'), theme = THEME) => ({ [OXIDE.pack]: pack, [OXIDE.themes[0]!]: theme })

test('an install writes the theme and the pack and records both with hashes', async () => {
  const { host, files } = fakeHost({ fetches: fetchesFor() })
  expect((await installEntry(host, OXIDE, { force: false })).name).toBe('oxide')
  expect(files[`${THEMES_DIR}/oxide.json`]).toBe(THEME)
  expect(files[`${PACKS_DIR}/oxide.json`]).toBe(PACK('oxide'))
  expect(await loadRecord(host)).toEqual({ packs: { oxide: { url: OXIDE.pack, hash: textHash(PACK('oxide')) } }, themes: { oxide: { hash: textHash(THEME) } } })
})

test('refused installs write nothing at all', async () => {
  const cases: Record<string, string>[] = [
    fetchesFor(PACK('oxide-dark')),                       // the file names another pack
    fetchesFor(PACK('oxide', { colors: { rows: 'nope' } })), // valid name, invalid pack
    fetchesFor(PACK('oxide'), '{'),                       // the theme does not parse
    { [OXIDE.themes[0]!]: THEME },                        // the pack does not download
  ]
  for (const fetches of cases) {
    const { host, files } = fakeHost({ fetches })
    const r = await installEntry(host, OXIDE, { force: false })
    expect(r.name).toBeUndefined()
    expect(Object.keys(files)).toEqual([])
  }
})

test('a second theme that fails leaves the first unwritten', async () => {
  const two = { ...OXIDE, themes: [OXIDE.themes[0]!, 'https://example.com/themes/bad.json'] }
  const { host, files } = fakeHost({ fetches: { ...fetchesFor(), 'https://example.com/themes/bad.json': '[]' } })
  expect((await installEntry(host, two, { force: false })).name).toBeUndefined()
  expect(files[`${THEMES_DIR}/oxide.json`]).toBeUndefined()
})

test('a message about a mismatched name shows the downloaded name safely', async () => {
  const { host } = fakeHost({ fetches: fetchesFor(PACK('evil\u001b[31m')) })
  expect((await installEntry(host, OXIDE, { force: false })).message).not.toContain('\u001b')
})

test('a download that is not a pack file says so instead of naming undefined', async () => {
  for (const text of ['<html>404</html>', '[]', '{"format":1}']) {
    const { host, files } = fakeHost({ fetches: fetchesFor(text) })
    const r = await installEntry(host, OXIDE, { force: false })
    expect(r.message).toContain('is not a pack file')
    expect(r.message).not.toContain('undefined')
    expect(Object.keys(files)).toEqual([])
  }
})

test('an existing theme is reused on a first install', async () => {
  const mine = JSON.stringify({ name: 'oxide', extends: 'dusk' })
  const { host, files } = fakeHost({ fetches: fetchesFor(), files: { [`${THEMES_DIR}/oxide.json`]: mine } })
  expect((await installEntry(host, OXIDE, { force: false })).name).toBe('oxide')
  expect(files[`${THEMES_DIR}/oxide.json`]).toBe(mine)
  expect((await loadRecord(host)).themes).toEqual({})
})

test('force refreshes a recorded, unchanged theme but never an unrecorded or changed one', async () => {
  const newTheme = JSON.stringify({ name: 'oxide', extends: 'aurora' })
  const recorded = { packs: { oxide: { url: OXIDE.pack, hash: textHash(PACK('oxide')) } }, themes: { oxide: { hash: textHash(THEME) } } }
  const base = { [`${PACKS_DIR}/oxide.json`]: PACK('oxide'), [`${THEMES_DIR}/oxide.json`]: THEME }
  const ok = fakeHost({ fetches: fetchesFor(PACK('oxide'), newTheme), files: { ...base, [RECORD_FILE('/home/u/.claude')]: JSON.stringify(recorded) } })
  await installEntry(ok.host, OXIDE, { force: true })
  expect(ok.files[`${THEMES_DIR}/oxide.json`]).toBe(newTheme)
  const mine = JSON.stringify({ name: 'oxide', extends: 'dusk' })
  const kept = fakeHost({ fetches: fetchesFor(PACK('oxide'), newTheme), files: { ...base, [`${THEMES_DIR}/oxide.json`]: mine, [RECORD_FILE('/home/u/.claude')]: JSON.stringify(recorded) } })
  await installEntry(kept.host, OXIDE, { force: true })
  expect(kept.files[`${THEMES_DIR}/oxide.json`]).toBe(mine)
})

test('a name taken by an installed pack is refused without force, and nothing is written', async () => {
  const { host, files } = fakeHost({ fetches: fetchesFor(), files: { [`${PACKS_DIR}/oxide.json`]: PACK('oxide', { description: 'mine' }) } })
  expect((await installEntry(host, OXIDE, { force: false })).message).toContain('--force')
  expect(files[`${THEMES_DIR}/oxide.json`]).toBeUndefined()
})
