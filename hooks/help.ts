import { PACKS } from './packpresets.ts'

export const DOCS_URL = 'https://glowup.khimani.dev/'
export type HelpRow = readonly [command: string, what: string]

// The column the command text is padded to, in both the plain text and the drawn card.
export const COMMAND_COLS = 36

export const SHORT_ROWS: HelpRow[] = [
  ['/glowup config', 'open the config pane: pack, colors, layout'],
  ['/glowup pack <name>', `switch look: ${Object.keys(PACKS).sort().join(' ')}`],
  ['/glowup pet clawd|robot|off', 'pick a pet, or none'],
  ['/glowup pane', 'open or close the side pane'],
  ['/glowup motion reduced', 'calm everything down'],
]

export const SECTIONS: readonly (readonly [title: string, rows: HelpRow[]])[] = [
  ['Start here', [
    ['/glowup config', 'open the config pane: pack, colors, layout'],
    ['/glowup pane', 'open or close the side pane'],
  ]],
  ['Look', [
    ['/glowup pack <name>', 'switch the whole look'],
    ['/glowup pack list', 'packs you have'],
    ['/glowup spinner <name|list|default>', 'just the spinner'],
    ['/glowup theme <name|list|default>', 'just the colors'],
    ['/glowup color <role> <#hex>', 'override one color, kept across packs'],
    ['/glowup color list', 'every role, with overrides marked'],
    ['/glowup color reset [role]', 'clear one override, or all'],
  ]],
  ['Pet', [
    ['/glowup pet clawd|robot|off', 'pick a pet, or none'],
    ['/glowup pet add <file|url>', 'install a pet from the studio'],
    ['/glowup bubbles on|off|haiku', 'his speech bubbles, templates or Haiku lines'],
  ]],
  ['Comfort', [
    ['/glowup motion reduced|full', 'animation off or on'],
  ]],
  ['Layout', [
    ['/glowup setup', 'band, tabs, meter, bubbles, pet sleep'],
    ['/glowup setup <key> <value>', 'change one, e.g. meter.danger 90'],
    ['/glowup setup reset', 'back to the defaults'],
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

const line = ([cmd, what]: HelpRow) => `  ${cmd.padEnd(COMMAND_COLS)} ${what}`

export const SHORT_TEXT = ['glowup', '', ...SHORT_ROWS.map(line), '', `more: /glowup help all   docs: ${DOCS_URL}`].join('\n')
export const FULL_TEXT = ['glowup', ...SECTIONS.flatMap(([title, rows]) => ['', title, ...rows.map(line)])].join('\n')
