import { PACKS } from './packpresets.ts'

export const DOCS_URL = 'https://glowup.khimani.dev/'
export type HelpRow = readonly [command: string, what: string]

// The column the command text is padded to, in both the plain text and the drawn card.
export const COMMAND_COLS = 36

export const SHORT_ROWS: HelpRow[] = [
  ['/glowup config', 'pick a look, pet and extras'],
  ['/glowup pack <name>', `switch look: ${Object.keys(PACKS).sort().join(' ')}`],
  ['/glowup pet clawd|off', 'Clawd, or no pet'],
  ['/glowup pane', 'open or close the side pane'],
  ['/glowup motion reduced', 'calm everything down'],
]

export const SECTIONS: readonly (readonly [title: string, rows: HelpRow[]])[] = [
  ['Start here', [
    ['/glowup config', 'pick a look, pet and extras'],
    ['/glowup pane', 'open or close the side pane'],
  ]],
  ['Look', [
    ['/glowup pack <name>', 'switch the whole look'],
    ['/glowup pack list', 'packs you have'],
    ['/glowup spinner <name|list|default>', 'just the spinner'],
    ['/glowup theme <name|list>', 'just the colors'],
    ['/glowup color <role> <#hex>', 'override one color, kept across packs'],
    ['/glowup color list', 'every role, with overrides marked'],
    ['/glowup color reset [role]', 'clear one override, or all'],
  ]],
  ['Pet', [
    ['/glowup pet clawd|off', 'Clawd, or no pet'],
    ['/glowup bubbles on|off|haiku', 'his speech bubbles, templates or Haiku lines'],
  ]],
  ['Comfort', [
    ['/glowup motion reduced|full', 'animation off or on'],
  ]],
  ['Make your own', [
    ['/glowup pack save <name>', 'save the current look'],
    ['/glowup pack <url>', 'install a shared pack'],
    ['/glowup theme add <url>', 'install a shared theme'],
    ['/glowup import <file>', 'Ghostty or base16 scheme → pack'],
    ['/glowup export konsole', 'your look as a Konsole scheme'],
  ]],
  ['Status line', [
    ['/glowup statusline on', 'let glowup draw it'],
    ['/glowup statusline fields <ids>', 'pick what it shows'],
    ['/glowup statusline restore', 'put yours back'],
  ]],
]

export const PICK_LABELS = ['Pack', 'Spinner', 'Pet', 'Extras', 'Status line'] as const
export const PICK_COLS = 13
export const TRY_COLS = 24
export const TRY_NEXT: HelpRow[] = [
  ['/glowup pane', 'open the side pane'],
  ['/glowup pack list', 'other looks'],
  ['/glowup help all', 'every command'],
]
export const PICKED_TITLE = 'You picked'
export const TRY_TITLE = 'Try next'

// The plain text the config wizard ends on; the CommandOutput hook parses it back with parsePicked, so
// the row stays a history record that never reads the live state.
export function configText(first: string, picked: readonly string[]): string {
  return [
    first, '',
    `  ${PICKED_TITLE}`, ...PICK_LABELS.map((l, i) => `  ${l.padEnd(PICK_COLS)}${picked[i]}`), '',
    `  ${TRY_TITLE}`, ...TRY_NEXT.map(([cmd, what]) => `  ${cmd.padEnd(TRY_COLS)}${what}`), '',
    `  docs: ${DOCS_URL}`,
  ].join('\n')
}

export function parsePicked(text: string): [label: string, value: string][] | undefined {
  const lines = text.split('\n')
  const at = lines.indexOf(`  ${PICKED_TITLE}`)
  if (at < 0) return undefined
  const rows: [string, string][] = []
  for (const [i, label] of PICK_LABELS.entries()) {
    const row = lines[at + 1 + i]
    const lead = `  ${label.padEnd(PICK_COLS)}`
    if (!row?.startsWith(lead)) return undefined
    rows.push([label, row.slice(lead.length)])
  }
  return rows
}

const line = ([cmd, what]: HelpRow) => `  ${cmd.padEnd(COMMAND_COLS)} ${what}`

export const SHORT_TEXT = ['glowup', '', ...SHORT_ROWS.map(line), '', `more: /glowup help all   docs: ${DOCS_URL}`].join('\n')
export const FULL_TEXT = ['glowup', ...SECTIONS.flatMap(([title, rows]) => ['', title, ...rows.map(line)])].join('\n')
