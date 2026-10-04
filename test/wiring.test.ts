import { test, expect } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

const scroll = { offset: 0, bodyRows: 10 }

test('band is empty when idle, on terminal and desktop', async ($, on) => {
  // the harness has no engine under the hooks: answer what the band asks of it
  on('ui.panes', async () => ({ value: [] }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  for (const surface of ['terminal', 'desktop'] as const) {
    const idle = await $.ui.mount({ plugin: 'glowup', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll, view: {} } })
    expect(await idle.find({ text: /♥/ })).toBeUndefined()
    await idle.unmount()
  }
})

test('pane draws three tab buttons', async $ => {
  const ui = await $.ui.mount({ plugin: 'glowup', surface: 'terminal', component: 'Pane', requestId: 'glowup', props: { title: 'glowup', isFocused: false, bodyColumns: 54, placement: 'dock', scroll, view: {} } })
  for (const label of ['Changes', 'Agents', 'Plan & context']) expect(await ui.find({ text: label })).toBeDefined()
  await ui.press({ key: 'tab-agents' })
  expect(await ui.find({ text: /AGENTS/ })).toBeDefined()
  await ui.unmount()
})
