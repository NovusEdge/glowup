import packsJson from '../../installer/internal/packs/packs.json';
import {CLAWD_SHEET as sheet} from '../../hooks/sprites/clawd.ts';

export type Colors = (typeof packsJson.packs)[number]['colors'];
export type PackData = (typeof packsJson.packs)[number];
export type SpinnerCell = {ch: string; fg: string; bg?: string};
export type SpinnerAnim = {id: string; name: string; ms: number; text: boolean; frames: SpinnerCell[][][]};

export const PACKS = packsJson.packs as PackData[];
export const THEMES = packsJson.themes;
export const SPINNERS = packsJson.spinners as SpinnerAnim[];
export const CLAWD_SHEET = sheet;

export const pack = (n: string) => PACKS.find(p => p.name === n) ?? PACKS[0];
export const spinner = (id: string) => SPINNERS.find(s => s.id === id) ?? SPINNERS[0];

export type Look = {
  name: string;
  description: string;
  rows: string;
  border: string;
  gradient: string[] | null;
  bg: string;
  borderColor: string;
  c: Colors;
  word: string;
  spinner: SpinnerAnim;
  spinTint: string;
  ownColors: boolean;
  ownSpinner: boolean;
};

// Mirrors installer/internal/tui/preview.go LookOf: a theme or spinner picked in Customize
// goes on top of the pack, and "classic" / "pack" mean the pack's own.
export function lookOf(packName: string, theme = 'classic', spin = 'pack'): Look {
  const p = pack(packName);
  const t = THEMES.find(x => x.name === theme);
  const ownColors = !t || theme === 'classic';
  const s = SPINNERS.find(x => x.id === spin);
  const sp = s ?? spinner(p.spinner.id);
  const c = ownColors ? p.colors : t!.colors;
  return {
    name: p.name,
    description: p.description,
    rows: p.rows,
    border: p.border,
    gradient: p.gradient,
    bg: ownColors ? p.bg : t!.colors.panel,
    borderColor: ownColors ? p.borderColor : t!.colors.faint,
    c,
    word: ownColors ? p.spinner.word : t!.word,
    spinner: sp,
    spinTint: p.spinner.color ?? c.accent,
    ownColors,
    ownSpinner: !s,
  };
}

const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// Spinner frames are white on black: a gray is a brightness, a colored cell (Clawd's own
// orange) stays as drawn. Same rule as shade() in preview.go.
export function shade(hex: string, tint: string, bg: string): string {
  const [r, g, b] = rgb(hex);
  return r !== g || g !== b ? hex : mix(bg, tint, r / 255);
}
