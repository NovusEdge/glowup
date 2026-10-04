import type { Cell } from './data.ts'

const QUAD: Record<string, number[]> = { '█': [1,1,1,1], '▐': [0,1,0,1], '▌': [1,0,1,0], '▛': [1,1,1,0], '▜': [1,1,0,1], '▙': [1,0,1,1], '▟': [0,1,1,1], '▝': [0,1,0,0], '▘': [1,0,0,0], '▗': [0,0,0,1], '▖': [0,0,1,0], '▀': [1,1,0,0], '▄': [0,0,1,1] }
const DOT = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]] as const
const r3 = (n: number) => Math.round(n * 1000) / 1000

export type CellOp =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; color: string }
  | { kind: 'dot'; x: number; y: number; r: number; color: string }
  | { kind: 'text'; x: number; y: number; ch: string; size: number; color: string }

// Terminals draw braille and block elements as cell geometry; browser fonts fall back to tiny or
// mis-sized glyphs for them. So cells become shapes: braille dots, block quadrants, other glyphs as text.
export function cellOps(rows: Cell[][], cw: number, ch: number, minRows = rows.length): { width: number; height: number; ops: CellOp[] } {
  const H = Math.max(rows.length, minRows), oy = (H - rows.length) * ch / 2
  const ops: CellOp[] = []
  rows.forEach((r, ry) => r.forEach((c, cx) => {
    const X = cx * cw, Y = oy + ry * ch, code = c.ch.codePointAt(0)!
    if (c.bg) ops.push({ kind: 'rect', x: r3(X), y: r3(Y), w: cw, h: ch, color: c.bg })
    if (code >= 0x2800 && code <= 0x28ff) {
      const b = code - 0x2800, r0 = Math.min(cw / 2, ch / 4) * 0.36
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 4; dy++)
        if (b & DOT[dx]![dy]!) ops.push({ kind: 'dot', x: r3(X + cw * (dx ? 0.72 : 0.28)), y: r3(Y + ch * (0.125 + dy * 0.25)), r: r3(r0), color: c.fg })
    } else if (QUAD[c.ch]) {
      QUAD[c.ch]!.forEach((on, i) => { if (on) ops.push({ kind: 'rect', x: r3(X + (i % 2) * cw / 2), y: r3(Y + (i > 1 ? ch / 2 : 0)), w: cw / 2, h: ch / 2, color: c.fg }) })
    } else if (c.ch.trim()) {
      ops.push({ kind: 'text', x: r3(X + cw / 2), y: r3(Y + ch / 2), ch: c.ch, size: Math.round(ch * 0.72), color: c.fg })
    }
  }))
  return { width: (rows[0]?.length ?? 0) * cw, height: H * ch, ops }
}
