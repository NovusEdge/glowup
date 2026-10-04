import { test, expect } from 'claude-code/testing'
import { parseScheme } from '../hooks/schemes.ts'

const ANSI = ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2', '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff']
const GHOSTTY = ['# Dracula', ...ANSI.map((c, i) => `palette = ${i}=${c}`), 'background = 282a36', 'foreground = #F8F8F2', 'cursor-color = #f8f8f2'].join('\n')
const BASE16 = ['scheme: "Ocean"', 'author: "x"', ...['2b303b', '343d46', '4f5b66', '65737e', 'a7adba', 'c0c5ce', 'dfe1e8', 'eff1f5', 'bf616a', 'd08770', 'ebcb8b', 'a3be8c', '96b5b4', '8fa1b3', 'b48ead', 'ab7967'].map((c, i) => `base0${i.toString(16).toUpperCase()}: "${c}"`)].join('\n')

test('ghostty: palette, background and foreground', async () => {
  const s = parseScheme(GHOSTTY, 'Dracula.conf')
  expect(s.name).toBe('dracula')
  expect(s.bg).toBe('#282a36')
  expect(s.palette.text).toBe('#f8f8f2')
  expect([s.palette.accent, s.palette.read, s.palette.edit, s.palette.shell, s.palette.agent, s.palette.pass, s.palette.fail, s.palette.dim])
    .toEqual(['#ff79c6', '#8be9fd', '#f1fa8c', '#50fa7b', '#bd93f9', '#50fa7b', '#ff5555', '#6272a4'])
  for (const v of Object.values(s.palette)) expect(v).toMatch(/^#[0-9a-f]{6}$/)
})

test('base16: base00-0F', async () => {
  const s = parseScheme(BASE16, 'base16-ocean.yaml')
  expect(s.name).toBe('ocean')
  expect([s.bg, s.palette.text, s.palette.fail, s.palette.pass, s.palette.accent, s.palette.dim]).toEqual(['#2b303b', '#c0c5ce', '#bf616a', '#a3be8c', '#b48ead', '#65737e'])
})

test('garbage, missing colors and oversize files are refused', async () => {
  expect(() => parseScheme('hello', 'x.txt')).toThrow('not a Ghostty or base16 color scheme')
  expect(() => parseScheme('palette = 0=#000000\nbackground = #000000\nforeground = #ffffff', 'x')).toThrow('no color 1')
  expect(() => parseScheme(GHOSTTY.replace(/^background.*$/m, ''), 'x')).toThrow('background')
  expect(() => parseScheme(GHOSTTY + '\n#' + 'x'.repeat(70_000), 'x')).toThrow('64 KB')
})

test('names are slugged and capped', async () => {
  expect(parseScheme(GHOSTTY, '/a/b/My Fancy Theme!!.conf').name).toBe('my-fancy-theme')
  expect(parseScheme(GHOSTTY, '???').name).toBe('imported')
})

test('control and bidi characters in a scheme name never survive', async () => {
  const evil = BASE16.replace('Ocean', 'Oc\u001b[2Jean‮​X')
  expect(parseScheme(evil, 'x').name).toBe('oc-2jean-x')
})
