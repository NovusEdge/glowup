import { test, expect } from 'claude-code/testing'
import { bandSegments, renderBand } from '../hooks/band.tsx'
import { visibleLength } from '../hooks/layout.tsx'
import { initialModel, applyEvent, LINGER_MS } from '../hooks/model.ts'
import { resolveTheme } from '../hooks/themes.ts'

const T = resolveTheme('classic', {}).theme

test('band line reads action, subagents, hearts and plan', async () => {
  let m = applyEvent(initialModel(), { type: 'turn-start', at: 0 })
  m = applyEvent(m, { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a', input: { description: 'scout' } })
  m = applyEvent(m, { type: 'tool-start', at: 2, tool: 'Edit', toolUseId: 'e', input: { file_path: '/r/src/auth.ts' } })
  m = { ...m, ctxPercent: 52, plan: [{ id: '1', title: 'x', status: 'completed' }, { id: '2', title: 'y', status: 'pending' }] }
  const text = bandSegments(m, T, 120).map(s => s.text).join('')
  expect(text).toBe('✎ Editing src/auth.ts  ·  ◆ 1 subagent  ·  ♥♥♥♡♡  ·  ◇ ●○')
})

test('band fits 40, 60 and 80 columns', async () => {
  let m = applyEvent(initialModel(), { type: 'tool-start', at: 1, tool: 'Read', toolUseId: 'r', input: { file_path: '/a/very/long/path/to/some/deeply/nested/file-name.ts' } })
  m = { ...m, working: true, ctxPercent: 30 }
  for (const w of [40, 60, 80]) expect(visibleLength(bandSegments(m, T, w))).toBeLessThanOrEqual(w)
})

// Fake element table: lets renderBand run without the engine.
const els = { Box: 'Box', Text: 'Text' }

test('renderBand draws only while working or lingering, and never when docked', async () => {
  const working = applyEvent(initialModel(), { type: 'turn-start', at: 0 })
  expect(renderBand(els, working, T, 120, 'medium', 10)).not.toBeNull()
  expect(renderBand(els, working, T, 120, 'wide', 10)).toBeNull()
  const done = applyEvent(working, { type: 'turn-done', at: 100 })
  expect(renderBand(els, done, T, 120, 'medium', 100 + LINGER_MS)).not.toBeNull()
  expect(renderBand(els, done, T, 120, 'medium', 100 + LINGER_MS + 1)).toBeNull()
  expect(renderBand(els, initialModel(), T, 120, 'compact', 0)).toBeNull()
})
