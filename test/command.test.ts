import { test, expect, mock } from 'claude-code/testing'
import { runGlowup } from './kit.ts'

test('/glowup with no args prints usage', async ($, on) => {
  mock.store(on)
  const out = await runGlowup($)
  expect(out.text).toContain('/glowup theme <name>')
})
