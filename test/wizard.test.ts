import { test, expect } from 'claude-code/testing'
import { fakeHost } from './kit.ts'
import { runCommand, USAGE, type Ctl } from '../hooks/command.ts'
import type { Mix } from '../hooks/packs.ts'
import type { PetSetting } from '../hooks/pets.ts'
import type { BubbleSetting } from '../hooks/bubbles.ts'

type Q = { question: string; header: string; options: string[]; multiSelect?: true }
const ESC = Symbol('esc')

// answers are consumed one per question; ESC rejects like a dismissed dialog
const rig = (answers: (string | typeof ESC)[], start: { mix?: Mix; pet?: PetSetting; bubbles?: BubbleSetting; reduced?: boolean; headless?: boolean } = {}, files: Record<string, string> = {}, store: Record<string, unknown> = {}) => {
  const { host, store: kv } = fakeHost({ files })
  Object.assign(kv, store)
  const asked: Q[] = []
  const calls: string[] = []
  let mix: Mix = start.mix ?? { colors: 'classic', motion: 'classic' }
  let pet = start.pet ?? 'clawd', bubbles = start.bubbles ?? 'on', reduced = start.reduced ?? false
  const ctl: Ctl = {
    current: () => 'classic',
    setTheme: async () => {},
    togglePane: async () => 'pane',
    setMotion: r => { reduced = r; calls.push('motion:' + r) },
    confirm: async () => true,
    mix: () => mix,
    setMix: async m => { mix = m; calls.push(`mix:${m.colors}`); return [] },
    pet: () => pet,
    setPet: p => { pet = p; calls.push('pet:' + p) },
    bubbles: () => bubbles,
    setBubbles: b => { bubbles = b; calls.push('bubbles:' + b) },
    reduced: () => reduced,
    ask: async (question, o) => {
      asked.push({ question, header: o.header, options: [...o.options], multiSelect: o.multiSelect })
      const a = answers.shift()
      if (a === undefined || a === ESC) throw new Error('dismissed')
      return a
    },
    headless: async () => start.headless === true,
  }
  return { host, kv, ctl, asked, calls, run: () => runCommand(host, 'config', ctl) }
}

test('asks Pack, Spinner, Pet, Extras in order with the current pack marked', async () => {
  const r = rig(['classic (current)', 'Pack default', 'Clawd', 'Turn bubbles off'])
  await r.run()
  expect(r.asked.map(q => q.header)).toEqual(['Pack', 'Spinner', 'Pet', 'Extras'])
  expect(r.asked[0]!.question).toBe('Which look?')
  expect(r.asked[0]!.options).toEqual(['arcade', 'classic (current)', 'cozy', 'crt'])
  expect(r.asked[1]!.question).toBe('Which spinner?')
  expect(r.asked[2]!.question).toBe('Who keeps you company?')
  expect(r.asked[2]!.options).toEqual(['Clawd', 'No pet'])
  expect(r.asked[3]!.question).toBe('Anything else to change?')
  expect(r.asked[3]!.multiSelect).toBe(true)
  expect(r.asked[3]!.options).toEqual(['Turn bubbles off', 'Turn reduced motion on'])
  expect(r.asked.every(q => q.options.length >= 2 && q.options.length <= 4 && q.header.length <= 12)).toBe(true)
})

test('each answer applies right away through the command paths', async () => {
  const r = rig(['arcade', 'Pack default', 'No pet', 'Turn bubbles off,Turn reduced motion on'])
  const out = await r.run()
  expect(r.kv.mix).toEqual({ colors: 'arcade', motion: 'arcade' })
  expect(r.kv.pet).toBe('off')
  expect(r.kv.bubbles).toBe('off')
  expect(r.kv.reducedMotion).toBe(true)
  expect(r.calls).toEqual(['mix:arcade', 'pet:off', 'bubbles:off', 'motion:true'])
  expect(out).toBe('glowup · arcade · no pet · bubbles off · reduced motion')
})

test('the spinner options are Pack default plus the first three ids that are not the pack\'s own', async () => {
  const classic = rig(['classic (current)', ESC])
  await classic.run()
  expect(classic.asked[1]!.options).toEqual(['Pack default', 'comet', 'eyes', 'orb-states'])
  const arcade = rig(['arcade', ESC])
  await arcade.run()
  expect(arcade.asked[1]!.options).toEqual(['Pack default', 'stock', 'comet', 'eyes'])
})

test('the active override is marked (current), and picking it applies nothing', async () => {
  const r = rig(['Keep custom mix', 'comet (current)', ESC], { mix: { colors: 'classic', motion: 'classic', spinner: 'comet' } })
  await r.run()
  expect(r.asked[1]!.options).toEqual(['Pack default', 'comet (current)', 'eyes', 'orb-states'])
  expect(r.calls).toEqual([])
})

test('Keep leaves the override and the spinner question still follows', async () => {
  const mix = { colors: 'cozy', motion: 'cozy', spinner: 'clawd' }
  const r = rig(['Keep custom mix', 'Pack default', ESC], { mix })
  await r.run()
  expect(r.asked[1]!.options).toEqual(['Pack default', 'stock', 'comet', 'orb-states'])
  expect(r.ctl.mix()).toEqual({ colors: 'cozy', motion: 'cozy' })
})

test('picking a spinner id applies it and the summary names it', async () => {
  const r = rig(['classic (current)', 'comet', 'Clawd', ''])
  const out = await r.run()
  expect(r.kv.mix).toEqual({ colors: 'classic', motion: 'classic', spinner: 'comet' })
  expect(out).toBe('glowup · classic · spinner comet · Clawd · bubbles on · full motion')
})

test('Pack default clears an override and does nothing when none is set', async () => {
  const set = rig(['Keep custom mix', 'Pack default', ESC], { mix: { colors: 'classic', motion: 'classic', spinner: 'eyes' } })
  const out = await set.run()
  expect(set.kv.mix).toEqual({ colors: 'classic', motion: 'classic' })
  expect(out).not.toContain('spinner')
  const none = rig(['classic (current)', 'Pack default', ESC])
  await none.run()
  expect(none.calls).toEqual([])
})

test('choosing a new pack drops the old override before the spinner question reads the mix', async () => {
  const r = rig(['crt', 'Pack default', ESC], { mix: { colors: 'cozy', motion: 'cozy', spinner: 'comet' } })
  await r.run()
  expect(r.asked[1]!.options).toEqual(['Pack default', 'stock', 'eyes', 'orb-states'])
  expect(r.calls).toEqual(['mix:crt'])
})

test('Other with a spinner id is trimmed and applied, and an unknown one stops with an error', async () => {
  const ok = rig(['classic (current)', '  shimmer ', ESC])
  await ok.run()
  expect(ok.kv.mix).toEqual({ colors: 'classic', motion: 'classic', spinner: 'shimmer' })
  const bad = rig(['classic (current)', 'ghost'])
  const out = await bad.run()
  expect(out).toBe('No spinner named "ghost".')
  expect(bad.asked).toHaveLength(2)
  expect(bad.calls).toEqual([])
})

test('Esc on the spinner question stops the wizard and keeps the pack pick', async () => {
  const r = rig(['cozy', ESC])
  const out = await r.run()
  expect(r.asked).toHaveLength(2)
  expect(r.kv.mix).toEqual({ colors: 'cozy', motion: 'cozy' })
  expect(out).toContain('cozy')
})

test('the first pick is applied before the next question is asked', async () => {
  const r = rig(['crt', ESC])
  await r.run()
  expect(r.calls).toEqual(['mix:crt'])
})

test('the summary line for untouched defaults', async () => {
  const r = rig(['classic (current)', 'Pack default', 'Clawd', ''])
  expect(await r.run()).toBe('glowup · classic · Clawd · bubbles on · full motion')
})

test('Other with an installed user pack applies it', async () => {
  const r = rig(['mine', 'Pack default', 'Clawd', ESC], {}, { '/home/u/.claude/glowup/packs/mine.json': JSON.stringify({ format: 1, name: 'mine', colors: { theme: 'classic' } }) })
  const out = await r.run()
  expect(r.kv.mix).toEqual({ colors: 'mine', motion: 'mine' })
  expect(out).toContain('· mine ·')
})

const MINE = { '/home/u/.claude/glowup/packs/mine.json': JSON.stringify({ format: 1, name: 'mine', colors: { theme: 'classic' } }) }

test('a user pack start offers Keep first, then classic and the built-ins up to four options', async () => {
  const r = rig(['Keep mine', 'Pack default', 'Clawd', ''], { mix: { colors: 'mine', motion: 'mine' } }, MINE)
  await r.run()
  expect(r.asked[0]!.options).toEqual(['Keep mine', 'classic', 'arcade', 'cozy'])
  expect(r.calls).toEqual([])
  expect(r.asked).toHaveLength(4)
})

test('a theme override start offers Keep custom mix and Keep leaves the override alone', async () => {
  const mix = { colors: 'classic', motion: 'classic', theme: 'dracula' }
  const r = rig(['Keep custom mix', 'Pack default', 'Clawd', ''], { mix })
  const out = await r.run()
  expect(r.asked[0]!.options).toEqual(['Keep custom mix', 'classic', 'arcade', 'cozy'])
  expect(r.calls).toEqual([])
  expect(r.ctl.mix()).toEqual(mix)
  expect(out).toContain('classic')
})

test('a spinner override start also counts as a custom mix', async () => {
  const r = rig(['Keep custom mix', ESC], { mix: { colors: 'cozy', motion: 'cozy', spinner: 'comet' } })
  await r.run()
  expect(r.asked[0]!.options[0]).toBe('Keep custom mix')
})

test('a built-in that did not fit stays reachable by typing it', async () => {
  const r = rig([' crt ', ESC], { mix: { colors: 'mine', motion: 'mine' } }, MINE)
  await r.run()
  expect(r.asked[0]!.options).not.toContain('crt')
  expect(r.kv.mix).toEqual({ colors: 'crt', motion: 'crt' })
})

test('a plain built-in start keeps four options and picking (current) applies nothing', async () => {
  const r = rig(['crt (current)', 'Pack default', 'Clawd', ''], { mix: { colors: 'crt', motion: 'crt' } })
  await r.run()
  expect(r.asked[0]!.options).toEqual(['arcade', 'classic', 'cozy', 'crt (current)'])
  expect(r.calls).toEqual([])
  expect(r.kv.mix).toBeUndefined()
})

test('typed pack text is trimmed', async () => {
  const r = rig(['  cozy  ', ESC])
  await r.run()
  expect(r.kv.mix).toEqual({ colors: 'cozy', motion: 'cozy' })
})

test('a failing apply surfaces as an error, not a success summary', async () => {
  const r = rig(['arcade'])
  r.host.storeSet = async () => { throw new Error('disk full') }
  await expect(r.run()).rejects.toThrow('disk full')
})

test('Other with an unknown name shows an error and stops', async () => {
  const r = rig(['ghost'])
  const out = await r.run()
  expect(out).toContain('ghost')
  expect(out).not.toContain('glowup ·')
  expect(r.asked).toHaveLength(1)
  expect(r.kv.mix).toBeUndefined()
})

test('Other text that smuggles a flag is not an installed pack', async () => {
  const r = rig(['classic --force'])
  await r.run()
  expect(r.asked).toHaveLength(1)
  expect(r.calls).toEqual([])
})

test('the shiny pet is offered only once unlocked, and applies', async () => {
  const r = rig(['classic (current)', 'Pack default', 'Clawd (shiny)', ESC], {}, {}, { eggs: { passRuns: 100, shinyAt: 5 } })
  const out = await r.run()
  expect(r.asked[2]!.options).toEqual(['Clawd', 'Clawd (shiny)', 'No pet'])
  expect(r.kv.pet).toBe('clawd-shiny')
  expect(out).toContain('Clawd (shiny)')
})

test('extras toggle relative to the current state, in both directions', async () => {
  const r = rig(['classic (current)', 'Pack default', 'Clawd', 'Turn bubbles on,Turn reduced motion off'], { bubbles: 'off', reduced: true })
  const out = await r.run()
  expect(r.asked[3]!.options).toEqual(['Turn bubbles on', 'Turn reduced motion off'])
  expect(out).toBe('glowup · classic · Clawd · bubbles on · full motion')
  expect(r.kv.bubbles).toBe('on')
  expect(r.kv.reducedMotion).toBe(false)
})

test('an empty extras selection changes nothing', async () => {
  const r = rig(['classic (current)', 'Pack default', 'Clawd', ''])
  await r.run()
  expect(r.kv.bubbles).toBeUndefined()
  expect(r.kv.reducedMotion).toBeUndefined()
})

test('Esc stops the wizard and keeps earlier picks', async () => {
  const r = rig(['cozy', ESC])
  const out = await r.run()
  expect(r.asked).toHaveLength(2)
  expect(r.kv.mix).toEqual({ colors: 'cozy', motion: 'cozy' })
  expect(out).toContain('cozy')
})

test('Esc on the first question changes nothing', async () => {
  const r = rig([ESC])
  const out = await r.run()
  expect(r.calls).toEqual([])
  expect(out).toContain('glowup · classic')
})

test('a headless run gets the usage text', async () => {
  const r = rig([ESC], { headless: true })
  expect(await r.run()).toBe(USAGE)
  expect(r.asked).toHaveLength(1)
})

test('usage describes config as a question wizard', () => {
  expect(USAGE).toContain('/glowup config')
  expect(USAGE).not.toContain('dialog')
})
