import { expect, mock } from 'claude-code/testing'
import { runGlowup, fakeFs, test } from './kit.ts'

const ROOT = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '')
const MANIFEST = `${ROOT}/.claude-plugin/plugin.json`
const CONFIG = '/fake/.claude/glowup'
const OXIDE = { name: 'oxide', description: 'bone text and red oxide on warm ink', pack: 'https://example.com/oxide.json', themes: ['https://example.com/oxide-theme.json'], minGlowup: '0.1.0' }
const INDEX = JSON.stringify({ format: 1, packs: [OXIDE] })
const PACK = JSON.stringify({ format: 1, name: 'oxide', colors: { theme: 'oxide' } })
const THEME = JSON.stringify({ name: 'oxide', extends: 'classic' })
const SERVED: Record<string, string> = { 'https://glowup.khimani.dev/packs.json': INDEX, [OXIDE.pack]: PACK, [OXIDE.themes[0]!]: THEME }
const ok = (text: string) => ({ value: { ok: true, status: 200, headers: {}, text } }) as never

// Wires the engine; `answer` decides each fetch, and every fetched url is recorded.
function boot(on: any, o: { files?: Record<string, string>; store?: Record<string, unknown>; answer?: (url: string) => unknown; beforeWrite?: () => void } = {}) {
  const fs = fakeFs(on, { [MANIFEST]: '{"name":"glowup","version":"0.9.0"}', ...o.files }, undefined, {}, o.beforeWrite)
  const clock = mock.clock(on)
  mock.store(on, o.store ?? {})
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('tool.call', async () => ({ result: {}, text: '' }) as never)
  const fetched: string[] = []
  on('http.fetch', async (_$: unknown, e: any) => {
    fetched.push(e.url)
    return (o.answer ?? ((u: string) => u in SERVED ? ok(SERVED[u]!) : { value: { ok: false, status: 404, headers: {}, text: '' } }))(e.url)
  })
  const toasts: string[] = []
  on('ui.toast', async (_$: unknown, e: any) => { toasts.push(e.text); return { value: undefined } as never })
  return { ...fs, clock, fetched, toasts }
}
const start = ($: any, isInteractive = true) => $.session.start({ cwd: '/r', surface: 'terminal', isInteractive })
const settle = async (clock: { advance(ms: number): Promise<void> }) => { for (let i = 0; i < 5; i++) await clock.advance(1) }
const catalogFetches = (fetched: string[]) => fetched.filter(u => u.endsWith('/packs.json'))

test('a failed index fetch at session start shows nothing and keeps the cache', async ($, on) => {
  const { files, toasts, clock } = boot(on, { files: { [`${CONFIG}/catalog.json`]: INDEX }, answer: () => { throw new Error('offline') } })
  await start($); await settle(clock)
  expect(files[`${CONFIG}/catalog.json`]).toBe(INDEX)
  expect(toasts.filter(t => /catalog|official|oxide/i.test(t))).toEqual([])
  expect((await runGlowup($, 'pack list')).text).toContain('classic')
})

test('a failed cache write at session start shows nothing', async ($, on) => {
  const { toasts, clock, fetched } = boot(on, { beforeWrite: () => { throw new Error('EACCES') } })
  await start($); await settle(clock)
  expect(catalogFetches(fetched)).toHaveLength(1)
  expect(toasts.filter(t => /catalog|EACCES/i.test(t))).toEqual([])
})

test('the first session start fetches and caches the index; a second within 24 hours does not', { timeoutMs: 60000 }, async ($, on) => {
  const { files, fetched, clock } = boot(on)
  await start($); await settle(clock)
  expect(files[`${CONFIG}/catalog.json`]).toBe(INDEX)
  expect(catalogFetches(fetched)).toHaveLength(1)
  await clock.advance(3_600_000)
  await start($); await settle(clock)
  expect(catalogFetches(fetched)).toHaveLength(1)
  await clock.advance(24 * 3_600_000)
  await start($); await settle(clock)
  expect(catalogFetches(fetched)).toHaveLength(2)
})

test('a non-interactive session with no configured catalog pack does not fetch', async ($, on) => {
  const { fetched, clock } = boot(on)
  await start($, false); await settle(clock)
  expect(fetched).toEqual([])
})

test('a configured catalog pack installs in the background and then loads', { options: { pack: 'oxide' } }, async ($, on) => {
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  const { files, clock } = boot(on, { answer: url => gate.then(() => url in SERVED ? ok(SERVED[url]!) : ok('')) })
  await start($)
  // start has returned while every download still waits
  expect(`${CONFIG}/packs/oxide.json` in files).toBe(false)
  expect((await runGlowup($, 'pack list')).text).toContain('● classic')
  release(); await settle(clock)
  expect(files[`${CONFIG}/packs/oxide.json`]).toBe(PACK)
  expect((await runGlowup($, 'pack list')).text).toContain('● oxide')
})

test('a configured catalog pack that cannot download shows the default and one toast, once', { options: { pack: 'oxide' } }, async ($, on) => {
  const { toasts, clock, files } = boot(on, { answer: () => { throw new Error('offline') } })
  await start($); await settle(clock)
  expect(toasts.filter(t => t.includes('oxide'))).toHaveLength(1)
  expect(`${CONFIG}/packs/oxide.json` in files).toBe(false)
  expect((await runGlowup($, 'pack list')).text).toContain('● classic')
  await start($); await settle(clock)
  expect(toasts.filter(t => t.includes('oxide'))).toHaveLength(1)
})

test('a pack the person chose with a command during the background install is kept', { options: { pack: 'oxide' } }, async ($, on) => {
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  const { files, clock } = boot(on, { answer: url => gate.then(() => url in SERVED ? ok(SERVED[url]!) : ok('')) })
  await start($)
  expect((await runGlowup($, 'pack crt')).text).toBe('Pack: crt')
  release(); await settle(clock)
  expect(files[`${CONFIG}/packs/oxide.json`]).toBe(PACK)
  expect((await runGlowup($, 'pack list')).text).toContain('● crt')
})

test('/plugin choosing an official pack with no cached index installs in the background, not a Not applied toast', { options: { pack: 'oxide' } }, async ($, on) => {
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  const { files, toasts, clock } = boot(on, {
    store: { mix: { colors: 'classic', motion: 'classic' }, 'plugin-seen': { pack: 'classic' } },
    answer: url => gate.then(() => url in SERVED ? ok(SERVED[url]!) : ok('')),
  })
  await start($)
  release(); await settle(clock)
  expect(toasts.filter(t => /Not applied/.test(t))).toEqual([])
  expect(files[`${CONFIG}/packs/oxide.json`]).toBe(PACK)
  expect((await runGlowup($, 'pack list')).text).toContain('● oxide')
})

test('/plugin choosing an official pack with a cached index does not hold session start for the download', { options: { pack: 'oxide' } }, async ($, on) => {
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  const { files, toasts, clock } = boot(on, {
    files: { [`${CONFIG}/catalog.json`]: INDEX },
    store: { mix: { colors: 'classic', motion: 'classic' }, 'plugin-seen': { pack: 'classic' } },
    answer: url => gate.then(() => url in SERVED ? ok(SERVED[url]!) : ok('')),
  })
  await start($)
  expect(`${CONFIG}/packs/oxide.json` in files).toBe(false)
  expect((await runGlowup($, 'pack list')).text).toContain('● classic')
  release(); await settle(clock)
  expect(files[`${CONFIG}/packs/oxide.json`]).toBe(PACK)
  expect((await runGlowup($, 'pack list')).text).toContain('● oxide')
  expect(toasts.filter(t => /Not applied/.test(t))).toEqual([])
})

test('/glowup pack <name> after start installs: the command host knows the version', async ($, on) => {
  const { files, clock } = boot(on, { files: { [`${CONFIG}/catalog.json`]: INDEX } })
  await start($); await settle(clock)
  const out = (await runGlowup($, 'pack oxide')).text as string
  expect(out).not.toContain('needs glowup')
  expect(files[`${CONFIG}/packs/oxide.json`]).toBe(PACK)
})
