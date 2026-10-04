import { test, expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { fakeFs } from './kit.ts'

declare function setTimeout(fn: (value: unknown) => void, ms: number): unknown
const scroll = { offset: 0, bodyRows: 10 }
const BAND = { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 100, scroll, view: {} }
const DIR = '/fake/.claude/glowup/instances'
const CACHE = '/fake/.claude/plugins/cache/glowup/glowup/0.2.2'

function boot(on: Parameters<typeof fakeFs>[0], files: Record<string, string>, id = 's1') {
  const fs = fakeFs(on, { '/fake/.claude/settings.json': '{}', ...files })
  mock.store(on)
  const toasts: string[] = []
  const registered: string[] = []
  on('command.register', async (_$, e) => { registered.push((e as { name: string }).name); return { value: undefined } as never })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } as never })
  on('ui.panes', async () => ({ value: [] }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  on('session.id', async () => ({ value: id }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: {}, text: '' }) as never)
  return { ...fs, toasts, registered }
}

const entry = (root: string, at: number) => JSON.stringify({ root, at })

test('a second copy registered first makes this one pass through and say so once', async ($, on) => {
  const { files, toasts, registered, writes } = boot(on, { [`${DIR}/s1.aa.json`]: entry('/elsewhere/glowup', Date.now() - 1000) })
  mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 400))
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('glowup is loaded twice')
  expect(toasts[0]).toContain('this copy is off. Disable one: claude plugin disable glowup@glowup')
  expect(registered).toEqual([])
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /♥/ })).toBeUndefined()
  await ui.unmount()
  expect(Object.keys(files).filter(f => f.includes('/glowup/status/'))).toEqual([])
  expect(files['/fake/.claude/settings.json']).toBe('{}')
  expect(writes.filter(p => !p.startsWith(DIR))).toEqual([])
})

test('an installed copy registered first loses to this dev copy, which keeps drawing', async ($, on) => {
  const { toasts, registered } = boot(on, { [`${DIR}/s1.aa.json`]: entry(CACHE, Date.now() - 1000) })
  mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect(toasts).toEqual([])
  expect(registered).toEqual(['glowup'])
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /♥/ })).toBeDefined()
  await ui.unmount()
})

test('a single copy is unaffected, and session end removes its entry', async ($, on) => {
  const { files, toasts, registered } = boot(on, {})
  mock.clock(on)
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect(toasts).toEqual([])
  expect(registered).toEqual(['glowup'])
  expect(Object.keys(files).filter(f => f.startsWith(DIR))).toHaveLength(1)
  await $.session.end({ reason: 'exit', sessionId: 's1' } as never)
})

test('a session id with path characters is cut down before it reaches a file name', async ($, on) => {
  const { files } = boot(on, {}, '../../x y')
  mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  const made = Object.keys(files).filter(f => f.startsWith(DIR))
  expect(made).toHaveLength(1)
  expect(made[0]).toMatch(/^\/fake\/\.claude\/glowup\/instances\/xy\.[0-9a-f]+\.json$/)
})
