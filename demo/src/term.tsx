import {Circle, Gradient, Node, Rect, Txt} from '@revideo/2d';
import {SimpleSignal, all, createSignal, easeOutCubic} from '@revideo/core';
import {SpinnerAnim, shade} from './data';
import {ColorKey, LookSig} from './look';

export const FONT = 'JetBrains Mono';
export const FS = 28;
export const CW = FS * 0.6; // JetBrains Mono advance: 600/1000 em
export const LH = 38;
const PAD = 28;
const BAR = 46;

export const binders: (() => void)[] = [];

export type Paint =ColorKey | string | (() => unknown);

export class Term {
  readonly root: Rect;
  readonly screen: Node;
  readonly width: number;
  readonly height: number;

  constructor(readonly look: LookSig, readonly cols: number, readonly rows: number, title = 'claude  ~/Projects/glowup') {
    this.width = cols * CW + 2 * PAD;
    this.height = rows * LH + BAR + 2 * PAD;
    this.root = (
      <Rect
        width={this.width}
        height={this.height}
        fill={look.sig.bg}
        stroke={look.sig.faint}
        lineWidth={2}
        radius={16}
        shadowBlur={70}
        shadowColor="#000000cc"
        clip
      />
    ) as Rect;
    const bar = (<Rect width={this.width} height={BAR} y={-this.height / 2 + BAR / 2} fill={look.sig.panel} />) as Rect;
    [0, 1, 2].forEach(i => bar.add(<Circle size={14} x={-this.width / 2 + 30 + i * 26} fill={['#ff5f57', '#febc2e', '#28c840'][i]} />));
    bar.add(<Txt text={title} fontFamily={FONT} fontSize={20} fill={look.sig.dim} />);
    this.root.add(bar);
    this.screen = (<Node x={-this.width / 2 + PAD} y={-this.height / 2 + BAR + PAD} />) as Node;
    this.root.add(this.screen);
  }

  paint(c: Paint): any {
    if (typeof c === 'string' && c in this.look.sig) return this.look.sig[c as ColorKey];
    return c;
  }

  txt(text: string | (() => string), col: number, row: number, color: Paint = 'text', opts: {bold?: boolean; parent?: Node; size?: number} = {}) {
    // Revideo spawns a text's glyph nodes lazily, which fails outside the scene's own
    // thread. A text that follows a signal is therefore refreshed from the frame loop.
    const fn = typeof text === 'function' ? text : null;
    const t = (
      <Txt
        text={fn ? fn() : (text as string)}
        x={col * CW}
        y={row * LH}
        offset={[-1, -1]}
        fontFamily={FONT}
        fontSize={opts.size ?? FS}
        fontWeight={opts.bold ? 700 : 400}
        lineHeight={LH}
        fill={this.paint(color)}
      />
    ) as Txt;
    (opts.parent ?? this.screen).add(t);
    if (fn) binders.push(() => (t.text() !== fn() ? t.text(fn()) : undefined));
    return t;
  }

  rect(col: number, row: number, w: number, h: number, props: Record<string, unknown>, parent: Node = this.screen) {
    const r = (<Rect x={col * CW} y={row * LH} width={w * CW} height={h * LH} offset={[-1, -1]} {...props} />) as Rect;
    parent.add(r);
    return r;
  }

  gradientFill(g: string[], cells: number) {
    const w = cells * CW;
    return new Gradient({from: [-w / 2, 0], to: [w / 2, 0], stops: [{offset: 0, color: g[0]}, {offset: 1, color: g[1]}]});
  }
}

// Quadrants lit per block character: bit 0 upper left, 1 upper right, 2 lower left, 3 lower right.
const QUAD: Record<string, number> = {
  '▘': 1, '▝': 2, '▖': 4, '▗': 8, '▌': 5, '▐': 10, '▀': 3, '▄': 12, '█': 15,
  '▙': 13, '▛': 7, '▜': 11, '▟': 14, '▚': 9, '▞': 6,
};

// The spinner as the mod draws it: a grid of single-cell glyphs. Each glyph sits in its
// own cell, so braille and star glyphs from fallback fonts cannot push the others off the grid.
export class SpinnerView {
  readonly node: Node;
  anim: SpinnerAnim;
  private cells: {t: Txt; b: Rect; q: Rect[]}[][] = [];

  constructor(private look: LookSig, col: number, row: number, anim: SpinnerAnim) {
    this.anim = anim;
    this.node = (<Node x={col * CW} y={row * LH} />) as Node;
    for (let r = 0; r < 2; r++) {
      this.cells.push([]);
      for (let c = 0; c < 5; c++) {
        const b = (<Rect x={c * CW} y={r * LH} width={CW + 0.5} height={LH + 0.5} offset={[-1, -1]} opacity={0} />) as Rect;
        const t = (<Txt x={c * CW + CW / 2} y={r * LH} offset={[0, -1]} fontFamily={FONT} fontSize={FS} lineHeight={LH} text="" />) as Txt;
        this.node.add(b);
        this.node.add(t);
        // Block characters are drawn as rectangles: font glyphs for them leave seams
        // between rows once the camera zooms in.
        const q = [0, 1, 2, 3].map(i => (
          <Rect x={c * CW + (i % 2) * (CW / 2)} y={r * LH + (i >> 1) * (LH / 2)} width={CW / 2 + 0.5} height={LH / 2 + 0.5} offset={[-1, -1]} opacity={0} />
        ) as Rect);
        q.forEach(n => this.node.add(n));
        this.cells[r].push({t, b, q});
      }
    }
  }

  update(t: number) {
    const s = this.anim;
    const i = Math.floor((t * 1000) / s.ms) % s.frames.length;
    const bg = this.look.sig.bg().hex();
    const tint = this.look.sig.spinTint().hex();
    this.cells.forEach((row, r) =>
      row.forEach(({t: txt, b, q}, c) => {
        const cell = s.frames[i][r]?.[c];
        const mask = cell ? QUAD[cell.ch] : undefined;
        txt.text(mask === undefined ? cell?.ch ?? '' : '');
        q.forEach((n, k) => {
          n.opacity(mask !== undefined && mask & (1 << k) ? 1 : 0);
          if (cell) n.fill(shade(cell.fg, tint, bg));
        });
        if (cell) txt.fill(shade(cell.fg, tint, bg));
        b.opacity(cell?.bg ? 1 : 0);
        if (cell?.bg) b.fill(shade(cell.bg, tint, bg));
      }),
    );
  }
}

export type Entry =
  | {k: 'user'; text: string}
  | {k: 'asst'; text: string; first?: boolean}
  | {k: 'tool'; tool: string; arg: string; res?: string; ok?: boolean}
  | {k: 'diff'; del: string; add: string};

export type Status = 'run' | 'ok' | 'fail';
export type Block = {node: Node; status: SimpleSignal<Status, void>; res?: Txt};

const TOOL_KEY: Record<string, ColorKey> = {Read: 'read', Edit: 'edit', Bash: 'shell', Task: 'agent'};
const MARKS = {
  cards: {ok: '✓', fail: '✗', run: '…'},
  retro: {ok: '[ OK ]', fail: '[FAIL]', run: '[....]'},
  classic: {ok: '●', fail: '●', run: '●'},
};

// Lays the conversation out in the style of the pack's rows (classic, cards, retro), as
// hooks/rows.tsx draws it. Rebuilding after a pack switch is how the rows change shape.
export class Convo {
  readonly layer: Node;
  private row = 1;
  readonly blocks: Block[] = [];

  constructor(private term: Term, private first = 1, private maxRow = 12) {
    this.layer = (<Node />) as Node;
    term.screen.add(this.layer);
    this.row = first;
  }

  clear() {
    this.layer.removeChildren();
    this.blocks.length = 0;
    this.row = this.first;
  }

  get style() {
    return this.term.look.look.rows as 'classic' | 'cards' | 'retro';
  }

  add(e: Entry, status: Status = 'ok', visible = true): Block {
    const T = this.term;
    const L = T.look;
    const look = L.look;
    const style = this.style;
    const st = createSignal<Status>(status);
    const node = (<Node y={this.row * LH} opacity={visible ? 1 : 0} />) as Node;
    const put = (text: string | (() => string), col: number, rel: number, color: Paint = 'text', o: {bold?: boolean} = {}) =>
      T.txt(text, col, rel, color, {...o, parent: node});
    const markColor = () => (st() === 'ok' ? L.sig.pass() : st() === 'fail' ? L.sig.fail() : L.sig.dim());
    let rows = 1;
    let resTxt: Txt | undefined;

    if (e.k === 'user') {
      if (style === 'classic') {
        put('>', 0, 0, 'accent', {bold: true});
        put(e.text, 2, 0, 'text');
      } else {
        const label = style === 'retro' ? '[YOU]' : 'you';
        const bar = style === 'cards' ? '▎ ' : '';
        const lab = put(bar + label, 0, 0, 'accent', {bold: true});
        if (look.gradient) lab.fill(T.gradientFill(look.gradient, bar.length + label.length));
        put((style === 'cards' ? '▎ ' : '') + e.text, 0, 1, 'text');
        if (style === 'cards') put('▎', 0, 1, 'accent');
        rows = 2;
      }
    } else if (e.k === 'asst') {
      const indent = style === 'retro' ? 3 : 2;
      if (style === 'classic') {
        put('● ' + e.text, 0, 0, 'text');
      } else {
        const label = style === 'retro' ? '[CLAUDE]' : 'claude';
        let r = 0;
        if (e.first !== false) {
          const lab = put((style === 'cards' ? '▎ ' : '') + label, 0, 0, 'accent', {bold: true});
          if (look.gradient) lab.fill(T.gradientFill(look.gradient, label.length + 2));
          r = 1;
        }
        put(e.text, indent, r, 'text');
        if (style === 'cards') put('▎', 0, r, 'faint');
        rows = r + 1;
      }
    } else if (e.k === 'tool') {
      const key = TOOL_KEY[e.tool] ?? 'accent';
      const label = `${e.tool}(${e.arg})`;
      if (style === 'classic') {
        put('●', 0, 0, markColor, {bold: true});
        put(e.tool, 2, 0, key, {bold: true});
        put(`(${e.arg})`, 2 + e.tool.length, 0, 'dim');
        if (e.res) resTxt = put('⎿  ' + e.res, 2, 1, e.ok === false ? 'fail' : 'dim');
        rows = e.res ? 2 : 1;
      } else if (style === 'cards') {
        const w = 56;
        node.add(
          <Rect
            x={0}
            y={LH * 0.5}
            width={w * CW}
            height={LH * 2}
            offset={[-1, -1]}
            stroke={L.sig.faint}
            lineWidth={look.border === 'bold' ? 4 : 2}
            radius={look.border === 'bold' ? 0 : 14}
          />,
        );
        const lab = put(label, 2, 1, key, {bold: true});
        if (look.gradient) lab.fill(T.gradientFill(look.gradient, label.length));
        put(() => ' ' + MARKS.cards[st()], w - 4, 1, markColor, {bold: true});
        if (e.res) resTxt = put(e.res, 2, 3, e.ok === false ? 'fail' : 'dim');
        rows = e.res ? 4 : 3;
      } else {
        const tag = `[${e.tool.toUpperCase().slice(0, 6).padEnd(6)}]`;
        put(tag, 0, 0, 'accent');
        put(label, 9, 0, 'text');
        put(() => MARKS.retro[st()], 50, 0, markColor);
        if (e.res) resTxt = put(e.res, 3, 1, e.ok === false ? 'fail' : 'dim');
        rows = e.res ? 2 : 1;
      }
    } else {
      const w = 54;
      const x0 = style === 'classic' ? 2 : style === 'retro' ? 3 : 2;
      T.rect(x0 - 0.5, 0, w, 1, {fill: L.sig.delBg}, node);
      T.rect(x0 - 0.5, 1, w, 1, {fill: L.sig.addBg}, node);
      put('− ' + e.del, x0, 0, 'fail');
      put('+ ' + e.add, x0, 1, 'pass');
      rows = 2;
    }

    this.layer.add(node);
    this.row += rows + (e.k === 'tool' ? 0 : 1);
    // A result line stays hidden until the tool finishes.
    if (resTxt && status === 'run') resTxt.opacity(0);
    const b = {node, status: st, res: resTxt};
    this.blocks.push(b);
    return b;
  }

  *show(b: Block, seconds = 0.28) {
    const y = b.node.y();
    b.node.y(y + 10);
    yield* all(b.node.opacity(1, seconds, easeOutCubic), b.node.y(y, seconds, easeOutCubic));
  }
}
