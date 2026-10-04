import type { Look } from './packs.ts'
import { gradient } from './color.ts'
import { describeTool } from './events.ts'
import { toolGlyph } from './restyle.ts'
import { MARKS, retroTag } from './rows-text.ts'

export type RowInput =
  | { site: 'ToolUse'; tool: string; input: unknown; isRunning: boolean; isErrored: boolean; isInterrupted: boolean }
  | { site: 'ToolResult' }
  | { site: 'UserMessage'; text: string; isExpanded: boolean; own: boolean }
  | { site: 'AssistantMessage'; isFirstOfReply: boolean; xp?: number }

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

// Built-in renderers size text from the terminal width, not their container, so only a little
// slack exists beside an engine row. The engine box is the one that gives up width; tags and
// marks keep theirs, or "[ OK ]" wraps its "]" onto the next line. Claude Code refuses an engine
// node under a Box with width, height, min sizes, overflow, display or position, so only the
// flex props go here (test/engine-tree.ts).
const shrinker = (Box: any, engine: unknown) => <Box flexGrow={1} flexShrink={1}>{engine}</Box>
const fixed = ({ Box, Text }: Els, color: string, s: string) => <Box flexShrink={0}><Text color={color} wrap="truncate">{s}</Text></Box>

// Messages are always a bar; tool rows are boxed unless prefixCards asks for the bar too.
function card({ Box, Text }: Els, look: Look, direction: 'row' | 'column', kids: unknown[], color: string, prefix?: boolean) {
  if (prefix) {
    return <Box flexDirection="row"><Text color={color}>{'▎ '}</Text><Box flexDirection={direction}>{kids}</Box></Box>
  }
  return <Box flexDirection={direction} borderStyle={look.border} borderColor={color} paddingX={1}>{kids}</Box>
}

// A glyph marker replaces the bar: the glyph column keeps the body aligned on every block of a reply.
function marked({ Box, Text }: Els, mark: string, color: string, kids: unknown[]) {
  return <Box flexDirection="row"><Text color={color}>{mark}</Text><Box flexDirection="column">{kids}</Box></Box>
}

// Right-aligned with flex alone: the engine refuses width props on an ancestor of its node, and this box is a sibling, not one.
function xpTag({ Box, Text }: Els, xp: number, color: string) {
  return <Box flexDirection="row" justifyContent="flex-end"><Text color={color}>{`+${xp} XP`}</Text></Box>
}

export function styleRow(els: Els, look: Look, row: RowInput, engine: unknown, opts: { prefixCards?: boolean } = {}): unknown {
  const out = draw(els, look, row, engine, opts)
  if (look.rows === 'classic') return out
  const { Box } = els
  // Column, not Ink's default row: a row wrapper shrinks bordered cards to content width.
  return <Box flexDirection="column" marginLeft={1}>{out}</Box>
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
        return <Box flexDirection="row">{shrinker(Box, engine)}<Box marginTop={1} flexShrink={0}><Text color={g.color} wrap="truncate">{'  ' + g.glyph}</Text></Box></Box>
      }

      case 'cards': {
        if (row.site === 'ToolResult') return <Box paddingLeft={2}>{engine}</Box>
        if (row.site === 'ToolUse') {
          const m = mark(look, row, MARKS.cards)
          return card(els, look, 'row', [shrinker(Box, engine), fixed(els, m.color, ' ' + m.mark)], c.faint, opts.prefixCards)
        }
        const { labels, markers, xp } = look.rowFlags
        if (row.site === 'UserMessage') {
          const kids = labels ? [label(els, 'you', look, c.accent), engine] : [engine]
          return markers ? marked(els, '▶ ', c.accent, kids) : card(els, look, 'column', kids, c.accent, true)
        }
        const kids = row.isFirstOfReply && labels ? [label(els, 'claude', look, c.accent), engine] : [engine]
        const body = markers ? marked(els, row.isFirstOfReply ? '◆ ' : '  ', c.read, kids) : card(els, look, 'column', kids, c.faint, true)
        return xp && row.isFirstOfReply && row.xp ? <Box flexDirection="column">{xpTag(els, row.xp, c.edit)}{body}</Box> : body
      }

      case 'minimal': {
        if (row.site === 'UserMessage') return <Text><Text color={c.accent}>{'› '}</Text><Text color={c.text}>{row.text}</Text></Text>
        if (row.site === 'ToolUse' && !row.isRunning && !row.isErrored && !row.isInterrupted) {
          return <Text color={c.dim}>{'· ' + describeTool(row.tool, input).label}</Text>
        }
        return engine
      }

      case 'retro': {
        if (row.site === 'ToolResult') return <Box paddingLeft={3}>{engine}</Box>
        if (row.site === 'UserMessage') return look.rowFlags.labels ? <Box flexDirection="column">{label(els, '[YOU]', look, c.accent, true)}{engine}</Box> : engine
        if (row.site === 'AssistantMessage') {
          const body = <Box paddingLeft={3}>{engine}</Box>
          return row.isFirstOfReply && look.rowFlags.labels ?<Box flexDirection="column">{label(els, '[CLAUDE]', look, c.accent, true)}{body}</Box> : body
        }
        const m = mark(look, row, MARKS.retro)
        return <Box flexDirection="row"><Box flexShrink={0}>{label(els, retroTag(row.tool), look, c.accent)}</Box>{shrinker(Box, engine)}{fixed(els, m.color, ' ' + m.mark)}</Box>
      }
    }
    return engine
  } catch {
    return engine
  }
}
