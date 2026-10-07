import { test, expect } from 'claude-code/testing'
import { fakeHost } from './kit.ts'
import { parseCatalog, compareVersions, canRun, loadCatalog, refreshCatalog, CATALOG_URL, CATALOG_FILE, type CatalogEntry } from '../hooks/catalog.ts'

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
