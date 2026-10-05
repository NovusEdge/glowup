import type { Look } from './packs.ts'
import { renderSegs, type Seg } from './layout.tsx'
import { SHORT_ROWS, SECTIONS, COMMAND_COLS, DOCS_URL, PICK_COLS, TRY_COLS, TRY_NEXT, PICKED_TITLE, TRY_TITLE, type HelpRow } from './help.ts'

// `els` is the table from $.ui.resolve(e).
type Els = { Box: any; Text: any }

export function renderHeader(els: Els, look: Look) {
  const { Box } = els
  const c = look.theme.colors
  const word = (look.theme.spinnerWords[0] ?? 'Thinking') + '…'
  const swatches = [c.accent, c.read, c.edit, c.shell, c.pass].flatMap((color, i): Seg[] => [...(i ? [{ text: ' ', color }] : []), { text: '██', color }])
  const header: Seg[] = [{ text: 'glowup', color: c.accent, bold: true }, { text: '  ', color: c.text }, ...swatches, { text: '  ✻ ' + word, color: c.accent }]
  return <Box key="header" flexDirection="column" borderStyle={look.border} borderColor={look.borderColor} paddingX={1}>{renderSegs(els, header)}</Box>
}

export function renderConfigCard(els: Els, look: Look, picked: readonly (readonly [string, string])[]) {
  const { Box } = els
  const c = look.theme.colors
  const gap = (key: string) => renderSegs(els, [], key)
  const title = (text: string, key: string) => renderSegs(els, [{ text: '  ' + text, color: c.accent, bold: true }], key)
  return (
    <Box flexDirection="column">
      {renderHeader(els, look)}
      {gap('gap')}
      {title(PICKED_TITLE, 'picked')}
      {picked.map(([label, value]) => renderSegs(els, [
        { text: '  ' + label.padEnd(PICK_COLS), color: c.dim }, { text: value, color: c.text },
      ], label))}
      {gap('gap2')}
      {title(TRY_TITLE, 'try')}
      {TRY_NEXT.map(([name, what]) => renderSegs(els, [
        { text: '  ' + name.padEnd(TRY_COLS), color: c.text, bold: true }, { text: what, color: c.dim },
      ], name))}
      {gap('gap3')}
      {renderSegs(els, [{ text: '  docs: ', color: c.dim }, { text: DOCS_URL, color: c.accent }], 'docs')}
    </Box>
  )
}

const LIST_ROW = /^([●○]) (\S+)\s+(#[0-9a-fA-F]{6})  (.+?)(  \(override\))?$/

// The same lines /glowup color list printed, with a swatch drawn in each role's color.
export function renderColorList(els: Els, look: Look, text: string) {
  const { Box } = els
  const c = look.theme.colors
  const lines = text.split('\n')
  const rows = lines.map(l => LIST_ROW.exec(l))
  if (!rows.some(Boolean)) return undefined
  return (
    <Box flexDirection="column">
      {lines.map((l, i) => {
        const m = rows[i]
        if (!m) return renderSegs(els, [{ text: l, color: c.dim }], 'l' + i)
        const [, mark, role, hex, label, over] = m
        return renderSegs(els, [
          { text: mark + ' ', color: over ? c.accent : c.dim },
          { text: '██ ', color: hex! },
          { text: role!.padEnd(7), color: c.text },
          { text: hex! + '  ', color: c.dim },
          { text: label!, color: c.dim },
          ...(over ? [{ text: over, color: c.accent }] : []),
        ], 'l' + i)
      })}
    </Box>
  )
}

export function renderHelp(els: Els, look: Look, full: boolean) {
  const { Box } = els
  const c = look.theme.colors
  const cmd = ([name, what]: HelpRow, key: string) => renderSegs(els, [
    { text: '  ' + name.padEnd(COMMAND_COLS) + ' ', color: c.text, bold: true }, { text: what, color: c.dim },
  ], key)
  const gap = (key: string) => renderSegs(els, [], key)
  return (
    <Box flexDirection="column">
      {renderHeader(els, look)}
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
