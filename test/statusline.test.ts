import { test, expect } from 'claude-code/testing'
import { takeOver, restore, statusText } from '../hooks/statusline.ts'
import { initialModel } from '../hooks/model.ts'
import { resolveTheme } from '../hooks/themes.ts'
import { fakeHost } from './kit.ts'

const SETTINGS = '/home/u/.claude/settings.json'
const SCRIPT = '/home/u/.claude/glowup/statusline.sh'

test('takeover changes only statusLine and restore puts it back', async () => {
  const original = { model: 'opus', statusLine: { type: 'command', command: 'ccstatusline' }, hooks: { Stop: [] } }
  const { host, files, ran } = fakeHost({ files: { [SETTINGS]: JSON.stringify(original, null, 2) } })
  const msg = await takeOver(host)
  expect(msg).toContain('restore')
  const after = JSON.parse(files[SETTINGS]!)
  expect(after.statusLine).toEqual({ type: 'command', command: `sh ${SCRIPT}` })
  expect({ ...after, statusLine: undefined }).toEqual({ ...original, statusLine: undefined })
  expect(files[SCRIPT]).toContain('ccstatusline')
  await restore(host)
  expect(JSON.parse(files[SETTINGS]!)).toEqual(original)
  expect(ran).toContain(`rm -f ${SCRIPT}`)
})

test('restore removes the key when there was none before, and forgets the backup', async () => {
  const { host, files, store } = fakeHost({ files: { [SETTINGS]: '{"model":"opus"}' } })
  await takeOver(host)
  await restore(host)
  expect(JSON.parse(files[SETTINGS]!)).toEqual({ model: 'opus' })
  expect('statusline-backup' in store).toBe(false)
  expect(await restore(host)).toContain('Nothing to restore')
})

test('takeover twice keeps the first backup', async () => {
  const { host, files } = fakeHost({ files: { [SETTINGS]: '{"statusLine":{"type":"command","command":"mine"}}' } })
  await takeOver(host)
  await takeOver(host)
  await restore(host)
  expect(JSON.parse(files[SETTINGS]!).statusLine.command).toBe('mine')
})

test('unreadable settings refuse the takeover and touch nothing', async () => {
  const { host, files } = fakeHost({ files: { [SETTINGS]: '{ not json' } })
  expect(await takeOver(host)).toContain('could not read')
  expect(files[SETTINGS]).toBe('{ not json')
})

test('declining the question changes nothing', async () => {
  const { host, files, store } = fakeHost({ files: { [SETTINGS]: '{"model":"opus"}' } })
  const asked: string[] = []
  const msg = await takeOver(host, async q => { asked.push(q); return false })
  expect(asked.length).toBe(1)
  expect(msg).toContain('unchanged')
  expect(files[SETTINGS]).toBe('{"model":"opus"}')
  expect(SCRIPT in files).toBe(false)
  expect('statusline-backup' in store).toBe(false)
})

test('the question warns when a project statusLine overrides the user one', async () => {
  const withProject = fakeHost({ files: { [SETTINGS]: '{}' }, projectStatusLine: true })
  let q = ''
  await takeOver(withProject.host, async s => { q = s; return false })
  expect(q).toContain('project')
  const plain = fakeHost({ files: { [SETTINGS]: '{}' } })
  await takeOver(plain.host, async s => { q = s; return false })
  expect(q).not.toContain('project')
})

test('accepting the question takes over', async () => {
  const { host, files } = fakeHost({ files: { [SETTINGS]: '{}' } })
  await takeOver(host, async () => true)
  expect(JSON.parse(files[SETTINGS]!).statusLine.command).toBe(`sh ${SCRIPT}`)
})

test('status text', async () => {
  const T = resolveTheme('classic', {}).theme
  expect(statusText(initialModel(), T)).toBeUndefined()
  expect(statusText({ ...initialModel(), working: true, ctxPercent: 48, act: { glyph: '✎', label: 'Editing a.ts', tone: 'edit' } }, T)).toBe('◆ editing · ctx 48%')
})

test('status word comes from the glyph, not the label', async () => {
  const T = resolveTheme('classic', {}).theme
  const line = (glyph: string) =>
    statusText({ ...initialModel(), working: true, ctxPercent: 1, act: { glyph, label: 'Frobnicating', tone: 'text' } }, T)
  const cases: Record<string, string> = { '▸': 'reading', '⌕': 'searching', '✎': 'editing', $: 'running', '◆': 'delegating', '✗': 'failing', '✓': 'passing', '!': 'waiting', '✻': 'thinking', '·': 'thinking' }
  for (const [g, w] of Object.entries(cases)) expect(line(g)).toBe(`◆ ${w} · ctx 1%`)
  expect(statusText({ ...initialModel(), ctxPercent: 5 }, T)).toBe('◆ idle · ctx 5%')
})
