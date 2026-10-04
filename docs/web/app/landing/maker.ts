import { parseJsonc, resolveTheme, type Theme } from './data.ts'

export const MAKER_START = `{
  // only write what differs
  "extends": "dusk",
  "colors": {
    "accent": "#ff8c42",
    "edit": "#ffd166",
    "read": "#7bdff2",
    "fail": "#ef476f"
  },
  "spinner": { "words": ["Cooking"] }
}`

// Same parse and resolve as /glowup theme, so the errors read like the mod's.
export function makerResult(text: string): { theme: Theme; error?: string } {
  let file: unknown
  try { file = parseJsonc(text) } catch (err) { return { ...resolveTheme('classic', {}), error: (err as Error).message } }
  return resolveTheme('sunset', { sunset: file })
}
