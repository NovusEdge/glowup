import type { Look } from './packs.ts'
import { renderSegs, type Seg } from './layout.tsx'
import { SHORT_ROWS, SECTIONS, COMMAND_COLS, DOCS_URL, type HelpRow } from './help.ts'

// `els` is the table from $.ui.resolve(e).
export function renderHelp(els: { Box: any; Text: any }, look: Look, full: boolean) {
  const { Box } = els
  const c = look.theme.colors
  const word = (look.theme.spinnerWords[0] ?? 'Thinking') + '…'
  const swatches = [c.accent, c.read, c.edit, c.shell, c.pass].flatMap((color, i): Seg[] => [...(i ? [{ text: ' ', color }] : []), { text: '██', color }])
  const header: Seg[] = [{ text: 'glowup', color: c.accent, bold: true }, { text: '  ', color: c.text }, ...swatches, { text: '  ✻ ' + word, color: c.accent }]
  const cmd = ([name, what]: HelpRow, key: string) => renderSegs(els, [
    { text: '  ' + name.padEnd(COMMAND_COLS) + ' ', color: c.text, bold: true }, { text: what, color: c.dim },
  ], key)
  const gap = (key: string) => renderSegs(els, [], key)
  return (
    <Box flexDirection="column">
      <Box key="header" flexDirection="column" borderStyle={look.border} borderColor={look.borderColor} paddingX={1}>{renderSegs(els, header)}</Box>
      {full
        ? SECTIONS.map(([title, rows]) => (
          <Box key={title} flexDirection="column">
            {gap('gap')}
            {renderSegs(els, [{ text: title, color: c.accent, bold: true }])}
            {rows.map(r => cmd(r, r[0]))}
          </Box>
        ))
        : <Box key="short" flexDirection="column">
          {gap('gap')}
          {SHORT_ROWS.map(r => cmd(r, r[0]))}
          {gap('gap2')}
          {renderSegs(els, [
            { text: 'more: ', color: c.dim }, { text: '/glowup help all', color: c.accent },
            { text: '   docs: ', color: c.dim }, { text: DOCS_URL, color: c.accent },
          ])}
        </Box>}
    </Box>
  )
}
