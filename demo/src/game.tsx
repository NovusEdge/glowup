import {BBox} from '@revideo/core';
import {Node, NodeProps, Rect, Txt} from '@revideo/2d';

// The game layer. Every size here is a multiple of U screen pixels, and nothing is drawn
// with a blur, a gradient or a soft shadow: fillRect only, so edges stay hard.
export const U = 4;
export const PF = "'Press Start 2P'";

export const C = {
  bg: '#1a0b33',
  deep: '#0e0620',
  panel: '#2a1450',
  faint: '#4a2a85',
  dim: '#9b86c9',
  text: '#f0e6ff',
  pink: '#ff3ec8',
  cyan: '#38e8ff',
  yellow: '#ffd23e',
  green: '#39ff88',
  red: '#ff4d6d',
};

type BitmapProps = NodeProps & {rows: string[]; palette: Record<string, string>; px: number};

// A sprite from rows of palette keys, '.' is empty.
export class Bitmap extends Node {
  rows: string[];
  palette: Record<string, string>;
  readonly px: number;

  constructor(props: BitmapProps) {
    super(props);
    this.rows = props.rows;
    this.palette = props.palette;
    this.px = props.px;
  }

  protected override getCacheBBox() {
    return new BBox(0, 0, this.rows[0].length * this.px, this.rows.length * this.px);
  }

  protected override async draw(ctx: CanvasRenderingContext2D) {
    this.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = this.palette[row[x]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x * this.px, y * this.px, this.px, this.px);
      }
    });
    await super.draw(ctx);
  }
}

const HEART = ['.XX.XX.', 'XHXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
export const heart = (full: boolean, px = U) =>
  (
    <Bitmap
      rows={HEART}
      px={px}
      palette={full ? {X: C.red, H: '#ffd0d8'} : {X: C.faint}}
    />
  ) as Bitmap;

// Fills a rectangle with an ordered pattern in whole screen pixels. level 1 lights one
// pixel in four, 2 a checkerboard, 3 three in four, 4 is solid.
const patterns = new Map<string, CanvasPattern>();
function pattern(ctx: CanvasRenderingContext2D, color: string, level: number, cell: number) {
  const key = `${color}${level}${cell}`;
  let p = patterns.get(key);
  if (!p) {
    const c = document.createElement('canvas');
    c.width = c.height = cell * 2;
    const g = c.getContext('2d')!;
    g.fillStyle = color;
    const on = [[0, 0], [1, 1], [1, 0], [0, 1]].slice(0, level === 1 ? 1 : level === 2 ? 2 : 3);
    for (const [x, y] of on) g.fillRect(x * cell, y * cell, cell, cell);
    p = ctx.createPattern(c, 'repeat')!;
    patterns.set(key, p);
  }
  return p;
}

// Darkens the playfield except for one rectangle (the focus). Coordinates are screen pixels
// from the top left; the node sits at the view's centre, so they are shifted by half the frame.
export class Spot extends Node {
  level = 0;
  hole = {x: 0, y: 0, w: 0, h: 0};
  area = {x: 0, y: 0, w: 1920, h: 1080};
  color = C.deep;
  frame = C.pink;

  protected override getCacheBBox() {
    return new BBox(-960, -540, 1920, 1080);
  }

  protected override async draw(ctx: CanvasRenderingContext2D) {
    if (this.level > 0) {
      const {x, y, w, h} = this.hole;
      const a = this.area;
      ctx.save();
      ctx.translate(-960, -540);
      ctx.beginPath();
      ctx.rect(a.x, a.y, a.w, a.h);
      ctx.rect(x, y, w, h);
      ctx.clip('evenodd');
      // Steps: a quarter of the pixels, a checkerboard, then flat. Text under a heavier
      // dither turns to noise, so the last step is a flat dark.
      if (this.level >= 3) {
        ctx.globalAlpha = 0.74;
        ctx.fillStyle = this.color;
      } else {
        ctx.fillStyle = pattern(ctx, this.color, this.level, U);
      }
      ctx.fillRect(a.x, a.y, a.w, a.h);
      ctx.restore();
      ctx.save();
      ctx.translate(-960, -540);
      ctx.fillStyle = this.frame;
      const t = U;
      ctx.fillRect(x - t, y - t, w + 2 * t, t);
      ctx.fillRect(x - t, y + h, w + 2 * t, t);
      ctx.fillRect(x - t, y, t, h);
      ctx.fillRect(x + w, y, t, h);
      ctx.restore();
    }
    await super.draw(ctx);
  }
}

// Same dither with no hole: dims a whole region.
export class Veil extends Node {
  level = 2;
  color = C.deep;
  size = {x: 0, y: 0, w: 1920, h: 1080};

  protected override getCacheBBox() {
    return new BBox(-960, -540, 1920, 1080);
  }

  protected override async draw(ctx: CanvasRenderingContext2D) {
    const s = this.size;
    ctx.save();
    ctx.translate(-960, -540);
    ctx.fillStyle = this.level >= 4 ? this.color : pattern(ctx, this.color, this.level, U);
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.restore();
    await super.draw(ctx);
  }
}

export const HUD_H = 80;

export type HudState = {lives: number; maxLives: number; level: number; xp: number; xpNext: number; score: number};

const pad = (n: number, w: number) => String(n).padStart(w, '0');

// Screen-fixed bar at the top. Left to right: lives, level, an XP bar with its number, score.
// Positions are screen pixels from the top left.
export function hud(s: HudState): Node {
  const root = (<Node x={-960} y={-540} />) as Node;
  root.add(<Rect x={960} y={HUD_H / 2} width={1920} height={HUD_H} fill={C.deep} />);
  root.add(<Rect x={960} y={HUD_H - U} width={1920} height={U} fill={C.faint} />);
  const label = (text: string, x: number, size = 16, fill: string = C.dim) =>
    root.add(<Txt text={text} x={x} y={(HUD_H - U) / 2} offset={[-1, 0]} fontFamily={PF} fontSize={size} fill={fill} />);

  label('LIFE', 40);
  for (let i = 0; i < s.maxLives; i++) {
    const h = heart(i < s.lives);
    h.position([40 + 4 * 16 + 24 + i * (7 * U + 12), (HUD_H - U) / 2 - 3 * U]);
    root.add(h);
  }

  const lvx = 440;
  label('LEVEL', lvx);
  label(pad(s.level, 2), lvx + 5 * 16 + 16, 24, C.yellow);

  const xpx = 800;
  label('XP', xpx);
  const segs = 16;
  const lit = Math.round((s.xp / s.xpNext) * segs);
  for (let i = 0; i < segs; i++) {
    root.add(<Rect x={xpx + 2 * 16 + 24 + i * 20 + 8} y={(HUD_H - U) / 2} width={16} height={24} fill={i < lit ? C.yellow : C.panel} />);
  }
  label(`${pad(s.xp, 4)}/${pad(s.xpNext, 4)}`, xpx + 2 * 16 + 24 + segs * 20 + 16, 16, C.text);

  label('SCORE', 1440);
  label(pad(s.score, 6), 1440 + 5 * 16 + 20, 24, C.text);
  return root;
}

// Ground strip: a grass line over two rows of alternating bricks, all in 16 px tiles.
export function ground(y: number, h: number): Node {
  const g = (<Node x={-960} y={y - 540} />) as Node;
  g.add(<Rect x={960} y={h / 2} width={1920} height={h} fill={C.panel} />);
  g.add(<Rect x={960} y={U} width={1920} height={2 * U} fill={C.green} />);
  g.add(<Rect x={960} y={3 * U} width={1920} height={U} fill="#1c7a47" />);
  for (let r = 0; r < Math.floor((h - 16) / 16); r++) {
    for (let x = (r % 2) * 16; x < 1920; x += 32) {
      g.add(<Rect x={x + 14} y={16 + r * 16 + 8} width={28} height={12} fill={C.bg} />);
    }
    g.add(<Rect x={960} y={16 + r * 16 + 16} width={1920} height={U / 2} fill={C.faint} />);
  }
  return g;
}
