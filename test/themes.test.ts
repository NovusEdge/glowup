import { test, expect } from 'claude-code/testing'
import { parseJsonc, resolveTheme, PRESETS, MAX_THEME_BYTES } from '../hooks/themes.ts'

test('parseJsonc strips line and block comments but not // inside strings', async () => {
  const v = parseJsonc('{\n // c\n "url": "https://x.dev", /* b */ "n": 1 }') as { url: string; n: number }
  expect(v.url).toBe('https://x.dev')
  expect(v.n).toBe(1)
})

test('parseJsonc counts UTF-8 bytes, not UTF-16 units', async () => {
  // 30000 x U+00E9 is 30000 UTF-16 units but 60000 bytes; pad past the limit in bytes only.
  const ok = '"' + 'é'.repeat(30000) + '"'
  expect(parseJsonc(ok)).toBe('é'.repeat(30000))
  const big = '"' + 'é'.repeat(33000) + '"'
  expect(big.length).toBeLessThan(MAX_THEME_BYTES)
  expect(() => parseJsonc(big)).toThrow()
})

test('classic resolves with every color set', async () => {
  const { theme, error } = resolveTheme('classic', {})
  expect(error).toBeUndefined()
  for (const v of Object.values(theme.colors)) expect(v).toMatch(/^#[0-9a-f]{6}$/i)
})

test('a user theme extends a preset and overrides one color', async () => {
  const { theme } = resolveTheme('mine', { mine: { name: 'mine', extends: 'cyberpunk', colors: { accent: '#123456' } } })
  expect(theme.colors.accent).toBe('#123456')
  expect(theme.colors.read).toBe(resolveTheme('cyberpunk', {}).theme.colors.read)
})

test('bad theme falls back to classic with a reason', async () => {
  const cases: [string, unknown][] = [
    ['bad-color', { name: 'x', colors: { accent: 'red' } }],
    ['bad-extends', { name: 'x', extends: 'nope' }],
    ['cycle', { name: 'cycle', extends: 'cycle' }],
    ['not-object', 42],
    ['hearts-one', { name: 'x', band: { hearts: ['a'] } }],
    ['hearts-three', { name: 'x', band: { hearts: ['a', 'b', 'c'] } }],
    ['hearts-not-array', { name: 'x', band: { hearts: 'ab' } }],
    ['hearts-long', { name: 'x', band: { hearts: ['ab', 'c'] } }],
    ['hearts-wide', { name: 'x', band: { hearts: ['a', '漢'] } }],
    ['glyph-wide-cjk', { name: 'x', glyphs: { read: '漢' } }],
    ['glyph-hangul', { name: 'x', glyphs: { read: '한' } }],
    ['glyph-fullwidth', { name: 'x', glyphs: { read: 'Ａ' } }],
    ['glyph-hangul-jamo', { name: 'x', glyphs: { read: 'ᄀ' } }],
    ['glyph-astral', { name: 'x', glyphs: { read: '😀' } }],
    ['glyph-two', { name: 'x', glyphs: { read: 'ab' } }],
    ['glyph-empty', { name: 'x', glyphs: { read: '' } }],
  ]
  for (const [name, file] of cases) {
    const { theme, error } = resolveTheme(name, { [name]: file })
    expect(theme.name).toBe('classic')
    expect(error).toBeDefined()
  }
})

test('valid hearts and narrow glyphs are accepted', async () => {
  const { theme, error } = resolveTheme('ok', { ok: { name: 'ok', glyphs: { read: '»' }, band: { hearts: ['*', '+'] } } })
  expect(error).toBeUndefined()
  expect(theme.glyphs.read).toBe('»')
  expect(theme.hearts).toEqual(['*', '+'])
})

test('unknown theme name falls back to classic', async () => {
  expect(resolveTheme('ghost', {}).error).toContain('ghost')
})

test('presets include the four built-ins', async () => {
  expect(Object.keys(PRESETS).sort()).toEqual(['classic', 'cyberpunk', 'high-contrast', 'vaporwave'])
  expect(MAX_THEME_BYTES).toBe(65536)
})
