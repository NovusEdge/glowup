import type { Look } from './packs.ts'
import { gradient } from './color.ts'
import { describeTool } from './events.ts'
import { toolGlyph } from './restyle.ts'

export type RowInput =
  | { site: 'ToolUse'; tool: string; input: unknown; isRunning: boolean; isErrored: boolean; isInterrupted: boolean }
  | { site: 'ToolResult' }
  | { site: 'UserMessage'; text: string; isExpanded: boolean; own: boolean }
  | { site: 'AssistantMessage'; isFirstOfReply: boolean }

type Els = { Box: any; Text: any }

const MARKS = {
  cards: { done: '✓', fail: '✗', stop: '■', run: '…' },
  retro: { done: '[ OK ]', fail: '[FAIL]', stop: '[STOP]', run: '[....]' },
}

function mark(look: Look, row: Extract<RowInput, { site: 'ToolUse' }>, set: typeof MARKS.cards) {
  const c = look.theme.colors
  if (row.isErrored) return { mark: set.fail, color: c.fail }
  if (row.isInterrupted) return { mark: set.stop, color: c.dim }
  if (row.isRunning) return { mark: set.run, color: c.dim }
  return { mark: set.done, color: c.pass }
}

// Per-character spans cost a Text each, hence the cap.
function label({ Text }: Els, text: string, look: Look, color: string, bold?: boolean) {
  if (look.gradient && [...text].length <= 48) {
    return <Text>{gradient(text, look.gradient[0], look.gradient[1]).map(s => <Text color={s.color} bold={bold}>{s.text}</Text>)}</Text>
  }
  return <Text color={color} bold={bold}>{text}</Text>
}

// Cards draw a full border; prefixCards is the fallback that draws a rule column instead.
function card({ Box, Text }: Els, look: Look, direction: 'row' | 'column', kids: unknown[], prefix?: boolean) {
  if (prefix) {
    return <Box flexDirection="row"><Text color={look.borderColor}>{'▎ '}</Text><Box flexDirection={direction}>{kids}</Box></Box>
  }
  return <Box flexDirection={direction} borderStyle={look.border} borderColor={look.borderColor} paddingX={1}>{kids}</Box>
}

export function styleRow(els: Els, look: Look, row: RowInput, engine: unknown, opts: { prefixCards?: boolean } = {}): unknown {
  try {
    const { Box, Text } = els
    if (row.site === 'UserMessage' && (!row.own || row.isExpanded)) return engine
    const input = row.site === 'ToolUse' && row.input !== null && typeof row.input === 'object' && !Array.isArray(row.input) ? row.input as Record<string, unknown> : {}
    const c = look.theme.colors

    switch (look.rows) {
      case 'classic': {
        if (row.site !== 'ToolUse' || row.isRunning) return engine
        const g = toolGlyph(look.theme, row.tool)
        if (!g) return engine
        return <Box flexDirection="row">{engine}<Box marginTop={1}><Text color={g.color}>{'  ' + g.glyph}</Text></Box></Box>
      }

      case 'cards': {
        if (row.site === 'ToolResult') return <Box paddingLeft={2}>{engine}</Box>
        if (row.site === 'ToolUse') {
          const m = mark(look, row, MARKS.cards)
          return card(els, look, 'row', [<Box flexGrow={1}>{engine}</Box>, <Text color={m.color}>{' ' + m.mark}</Text>], opts.prefixCards)
        }
        if (row.site === 'UserMessage') return card(els, look, 'column', [label(els, 'you', look, c.accent), engine], opts.prefixCards)
        return card(els, look, 'column', row.isFirstOfReply ? [label(els, 'claude', look, c.accent), engine] : [engine], opts.prefixCards)
      }

      case 'minimal': {
        if (row.site === 'UserMessage') return <Text><Text color={c.accent}>{'› '}</Text><Text color={c.text}>{row.text}</Text></Text>
        if (row.site === 'ToolUse' && !row.isRunning && !row.isErrored && !row.isInterrupted) {
          return <Text color={c.dim}>{'· ' + describeTool(row.tool, input).label}</Text>
        }
        return engine
      }

      case 'retro': {
        if (row.site === 'ToolResult') return <Box paddingLeft={9}>{engine}</Box>
        if (row.site === 'UserMessage') return <Box flexDirection="row"><Text color={c.accent}>{'[YOU] '}</Text><Box flexGrow={1}>{engine}</Box></Box>
        if (row.site === 'AssistantMessage') {
          const body = <Box paddingLeft={9}>{engine}</Box>
          return row.isFirstOfReply ? <Box flexDirection="column"><Text color={c.accent} bold>{'[CLAUDE]'}</Text>{body}</Box> : body
        }
        const m = mark(look, row, MARKS.retro)
        const tag = `[${row.tool.toUpperCase().slice(0, 6).padEnd(6)}] `
        return <Box flexDirection="row"><Text color={c.accent}>{tag}</Text><Box flexGrow={1}>{engine}</Box><Text color={m.color}>{' ' + m.mark}</Text></Box>
      }
    }
    return engine
  } catch {
    return engine
  }
}
