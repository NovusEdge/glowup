import type { Look } from './packs.ts'
import { gradient } from './color.ts'
import { describeTool } from './events.ts'
import { toolGlyph } from './restyle.ts'
import { MARKS, retroTag } from './rows-text.ts'

export type RowInput =
  | { site: 'ToolUse'; tool: string; input: unknown; isRunning: boolean; isErrored: boolean; isInterrupted: boolean }
  | { site: 'ToolResult' }
  | { site: 'UserMessage'; text: string; isExpanded: boolean; own: boolean }
  | { site: 'AssistantMessage'; isFirstOfReply: boolean }

type Els = { Box: any; Text: any }

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

// Messages are always a bar; tool rows are boxed unless prefixCards asks for the bar too.
function card({ Box, Text }: Els, look: Look, direction: 'row' | 'column', kids: unknown[], color: string, prefix?: boolean) {
  if (prefix) {
    return <Box flexDirection="row"><Text color={color}>{'▎ '}</Text><Box flexDirection={direction}>{kids}</Box></Box>
  }
  return <Box flexDirection={direction} borderStyle={look.border} borderColor={color} paddingX={1}>{kids}</Box>
}

export function styleRow(els: Els, look: Look, row: RowInput, engine: unknown, opts: { prefixCards?: boolean } = {}): unknown {
  const out = draw(els, look, row, engine, opts)
  if (look.rows === 'classic') return out
  const { Box } = els
  // Never edit the engine's own element: its props are Claude Code's.
  if (out !== engine && (out as any)?.type === Box) return { ...(out as any), props: { ...(out as any).props, marginLeft: 1 } }
  return <Box marginLeft={1}>{out}</Box>
}

function draw(els: Els, look: Look, row: RowInput, engine: unknown, opts: { prefixCards?: boolean }): unknown {
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
          return card(els, look, 'row', [<Box flexGrow={1}>{engine}</Box>, <Text color={m.color}>{' ' + m.mark}</Text>], c.faint, opts.prefixCards)
        }
        if (row.site === 'UserMessage') return card(els, look, 'column', [label(els, 'you', look, c.accent), engine], c.accent, true)
        return card(els, look, 'column', row.isFirstOfReply ? [label(els, 'claude', look, c.accent), engine] : [engine], c.faint, true)
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
        if (row.site === 'UserMessage') return <Box flexDirection="row">{label(els, '[YOU] ', look, c.accent, true)}<Box flexGrow={1}>{engine}</Box></Box>
        if (row.site === 'AssistantMessage') {
          const body = <Box paddingLeft={9}>{engine}</Box>
          return row.isFirstOfReply ? <Box flexDirection="column">{label(els, '[CLAUDE]', look, c.accent, true)}{body}</Box> : body
        }
        const m = mark(look, row, MARKS.retro)
        return <Box flexDirection="row">{label(els, retroTag(row.tool), look, c.accent)}<Box flexGrow={1}>{engine}</Box><Text color={m.color}>{' ' + m.mark}</Text></Box>
      }
    }
    return engine
  } catch {
    return engine
  }
}
