import {Node, Rect, Txt} from '@revideo/2d';
import {useTime} from '@revideo/core';
import {planOrder} from '../../hooks/tasks.ts';
import {Look} from './data';
import {CW, FONT, FS, LH, Paint, QUAD, Term, binders} from './term';

// The glowup pane as hooks/pane.tsx draws it: rows are lists of colored segments, built by
// the same rules (what a tab lists, how the context bar is split, what the status box says)
// and drawn one cell at a time so the camera can zoom without blurring.

export type Seg = {text: string; color: Paint; bold?: boolean; spin?: boolean};
export type TabId = 'changes' | 'agents' | 'plan';
export const TABS: [TabId, string][] = [['changes', 'Changes'], ['agents', 'Agents'], ['plan', 'Plan & context']];
export const COMPACT_ROWS = 6;

export type Act = {glyph: string; label: string; tone: 'text' | 'dim' | 'read' | 'edit' | 'shell' | 'agent' | 'pass' | 'fail' | 'accent'};
export type AgentRow = {name: string; task: string; now?: string; state: 'running' | 'done'; secs: number; tokens: number};
export type PlanRow = {title: string; active?: string; status: 'pending' | 'in_progress' | 'completed'};
export type FileRow = {path: string; add: number; del: number; how: 'edit' | 'new'};
export type Limit = {kind: 'five_hour' | 'seven_day'; percentUsed: number};

export type Model = {
  working: boolean;
  act: Act;
  agents: AgentRow[];
  plan: PlanRow[];
  files: FileRow[];
  ctxPct: number;
  ctxHistory: number[];
  limits?: Limit[];
  cats: Cat[];
  maxTokens: number;
};

export type Cat = {name: string; tokens: number; kind: string};

// hooks/ctxchart.ts without its imports: that file pulls in layout.tsx, which this project's JSX settings cannot type.
const SHORT: [RegExp, string][] = [[/system prompt/i, 'system'], [/system tools/i, 'tools'], [/mcp/i, 'mcp'], [/memory/i, 'memory'], [/messages?/i, 'messages']];
const shortName = (n: string) => SHORT.find(([re]) => re.test(n))?.[1] ?? n.toLowerCase().slice(0, 10);
const tokensK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
const BLOCKS = '▁▂▃▄▅▆▇█';
const sparkline = (samples: number[]) => samples.map(v => BLOCKS[Math.max(0, Math.min(7, Math.floor((v / 100) * 8)))]).join('');

// One bar of `width` cells; largest-remainder rounding keeps the cells summing to the width.
function stackBar(cats: Cat[], max: number, width: number) {
  const used = cats.filter(x => x.kind === 'used' && x.tokens > 0).sort((a, b) => b.tokens - a.tokens);
  const parts = used.map(x => ({label: shortName(x.name), share: x.tokens / max}));
  const shares = [...parts.map(p => p.share), Math.max(0, 1 - parts.reduce((n, p) => n + p.share, 0))];
  const exact = shares.map(x => x * width);
  const cells = exact.map(Math.floor);
  let left = width - cells.reduce((a, b) => a + b, 0);
  for (const i of exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]).map(x => x[1])) {
    if (left <= 0) break;
    cells[i]++;
    left--;
  }
  return parts.map((p, i) => ({label: p.label, pct: Math.round(p.share * 100), cells: cells[i]}));
}

export const READY: Act = {glyph: '✻', label: 'Ready', tone: 'text'};

export const initialModel = (): Model => ({
  working: false,
  act: READY,
  agents: [],
  plan: [
    {title: 'Read the styles', status: 'completed'},
    {title: 'Add the toggle', active: 'Adding the toggle', status: 'in_progress'},
    {title: 'Run the tests', status: 'pending'},
  ],
  files: [
    {path: 'theme.css', add: 12, del: 3, how: 'edit'},
    {path: 'app.tsx', add: 4, del: 1, how: 'edit'},
  ],
  ctxPct: 38,
  ctxHistory: [9, 14, 19, 24, 28, 32, 35, 38],
  limits: [{kind: 'five_hour', percentUsed: 30}, {kind: 'seven_day', percentUsed: 12}],
  cats: [
    {name: 'Messages', tokens: 45000, kind: 'used'},
    {name: 'System prompt', tokens: 14000, kind: 'used'},
    {name: 'System tools', tokens: 11000, kind: 'used'},
    {name: 'Memory files', tokens: 6000, kind: 'used'},
  ],
  maxTokens: 200000,
});

const len = (s: Seg[]) => s.reduce((n, x) => n + [...x.text].length, 0);
const sp = (n: number): Seg => ({text: ' '.repeat(Math.max(1, n)), color: 'text'});

function clip(segs: Seg[], w: number): Seg[] {
  if (len(segs) <= w) return segs;
  const out: Seg[] = [];
  let used = 0;
  for (const s of segs) {
    const n = [...s.text].length;
    if (used + n < w) {
      out.push(s);
      used += n;
      continue;
    }
    out.push({...s, text: [...s.text].slice(0, Math.max(0, w - used - 1)).join('') + '…'});
    break;
  }
  return out;
}

// The left part shrinks so the right part always shows, flush to the edge.
function spread(left: Seg[], right: Seg[], w: number): Seg[] {
  const rl = len(right);
  const l = clip(left, Math.max(1, w - rl - 1));
  return clip([...l, sp(w - len(l) - rl), ...right], w);
}

const header = (l: string, r: string, w: number): Seg[] => spread([{text: l, color: 'text', bold: true}], [{text: r, color: 'dim'}], w);

function cap(rows: Seg[][], w: number, reserve = 0, limit = COMPACT_ROWS): Seg[][] {
  const room = limit - reserve;
  if (rows.length <= room) return rows;
  return [...rows.slice(0, room - 1), clip([{text: `  … ${rows.length - room + 1} more`, color: 'dim'}], w)];
}

// The glyphs Ink draws for each borderStyle, as in hooks/pane.tsx.
const BOX: Record<string, {tl: string; tr: string; bl: string; br: string; h: string; v: string}> = {
  round: {tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│'},
  single: {tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│'},
  double: {tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║'},
  bold: {tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃'},
  classic: {tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|'},
};
const MIN_BOX = 16;
const boxInner = (w: number) => (w >= MIN_BOX ? w - 4 : w);

// Top edge: corner, rule, title, rule fill, right text, rule, corner. The right text goes first when room runs out.
function section(title: string, right: string, body: Seg[][], w: number, border: string): Seg[][] {
  if (w < MIN_BOX) return [header(title, right, w), ...body.map(r => clip(r, w))];
  const b = BOX[border] ?? BOX.round;
  const inner = w - 4;
  const edge = (text: string): Seg => ({text, color: 'faint'});
  const name: Seg = {text: ` ${title} `, color: 'text', bold: true};
  let tail: Seg[] = right ? [{text: ` ${right} `, color: 'dim'}] : [];
  if (len([name, ...tail]) > w - 5) tail = [];
  const label = clip([name], w - 5);
  const fill = w - 4 - len(label) - len(tail);
  const top = [edge(b.tl + b.h), ...label, edge(b.h.repeat(fill)), ...tail, edge(b.h + b.tr)];
  const row = (r: Seg[]): Seg[] => {
    const c = clip(r, inner);
    return [edge(b.v + ' '), ...c, {text: ' '.repeat(inner - len(c) + 1), color: 'text'}, edge(b.v)];
  };
  return [top, ...body.map(row), [edge(b.bl + b.h.repeat(w - 2) + b.br)]];
}

function changes(m: Model, look: Look, w: number, compact: boolean, limit: number): Seg[][] {
  const add = m.files.reduce((n, f) => n + f.add, 0);
  const del = m.files.reduce((n, f) => n + f.del, 0);
  const lead = compact ? '  ' : '';
  const iw = compact ? w : boxInner(w);
  const body: Seg[][] = [];
  if (!m.files.length) body.push([{text: lead + 'Nothing changed yet.', color: 'dim'}]);
  for (const f of m.files) {
    const left: Seg[] = [{text: lead, color: 'text'}, {text: '✎ ', color: 'edit'}, {text: f.path + (f.how === 'new' ? '  new' : ''), color: 'text'}];
    body.push(spread(left, [{text: `+${f.add}`, color: 'pass'}, {text: ` −${f.del}`, color: 'fail'}], iw));
  }
  if (compact) return cap(body, w, 0, limit).map(r => clip(r, w));
  return section('CHANGES', `${m.files.length} files  +${add} −${del}`, body, w, look.border);
}

function agents(m: Model, look: Look, w: number, compact: boolean, limit: number): Seg[][] {
  const live = m.agents.filter(a => a.state === 'running').length;
  const iw = boxInner(w);
  const body: Seg[][] = [];
  if (!m.agents.length) body.push([{text: (compact ? '  ' : '') + 'No subagents this session.', color: 'dim'}]);
  for (const a of m.agents) {
    const running = a.state === 'running';
    const mark: Seg = running ? {text: '⠋', color: 'agent', spin: true} : {text: '✓', color: 'pass'};
    if (compact) {
      body.push(clip([{text: ` ◆ ${a.name} `, color: 'agent', bold: true}, mark, {text: ' ' + (running ? a.now ?? a.task : a.task), color: running ? 'read' : 'dim'}], w));
      continue;
    }
    if (body.length) body.push([]);
    body.push(spread([{text: '◆ ' + a.name, color: 'agent', bold: true}], [{text: `${a.secs}s · ${(a.tokens / 1000).toFixed(1)}k `, color: 'dim'}, mark], iw));
    body.push(clip([{text: '  ' + a.task, color: 'text'}], iw));
    if (running && a.now) body.push(clip([{text: '  └ ', color: 'faint'}, {text: a.now, color: 'read'}], iw));
  }
  if (compact) return cap(body, w, 0, limit);
  return section('AGENTS', `${live} running · ${m.agents.length - live} done`, body, w, look.border);
}

// The roles palette() in hooks/ctxchart.ts hands out, in its order.
const STACK = ['read', 'agent', 'shell', 'edit', 'accent'] as const;

function stack(m: Model, width: number) {
  const slices = stackBar(m.cats, m.maxTokens, width).map((x, i) => ({...x, color: STACK[i] ?? 'text'}));
  const segs: Seg[] = slices.filter(x => x.cells > 0).map(x => ({text: '█'.repeat(x.cells), color: x.color}));
  const used = slices.reduce((n, x) => n + x.cells, 0);
  if (width - used > 0) segs.push({text: '░'.repeat(width - used), color: 'faint'});
  return {segs, slices};
}

function planRow(p: PlanRow, w: number, lead: string): Seg[] {
  const on = p.status === 'in_progress';
  const done = p.status === 'completed';
  return clip([{text: `${lead}${done ? '✓' : on ? '◉' : '○'} `, color: done ? 'pass' : on ? 'accent' : 'dim'}, {text: on && p.active ? p.active : p.title, color: done ? 'dim' : 'text', bold: on}], w);
}

const LABEL = 'over this session ';
function history(m: Model, w: number): Seg[] | undefined {
  if (!m.ctxHistory.length) return undefined;
  const lead = w >= 48 ? LABEL : '';
  const peak = `peak ${Math.max(...m.ctxHistory)}%`;
  // two cells keep the sparkline off the right-hand text
  const n = Math.max(0, Math.min(m.ctxHistory.length, w - lead.length - peak.length - 2));
  return spread([{text: lead, color: 'dim'}, {text: n ? sparkline(m.ctxHistory.slice(-n)) : '', color: 'accent'}], [{text: peak, color: 'dim'}], w);
}

function plan(m: Model, look: Look, w: number, compact: boolean, limit: number): Seg[][] {
  const done = m.plan.filter(p => p.status === 'completed').length;
  const lead = compact ? '  ' : '';
  const iw = compact ? w : boxInner(w);
  const {items: shown, hiddenDone} = planOrder(m.plan as never);
  const items = (shown as unknown as PlanRow[]).map(p => planRow(p, iw, lead));
  if (!m.plan.length) items.push([{text: lead + 'No task list yet.', color: 'dim'}]);
  if (compact) {
    const inner = Math.max(4, w - 12);
    const bar = stack(m, inner);
    const ctx: Seg[] = [{text: ' ctx ▕', color: 'dim'}, ...bar.segs, {text: `▏${String(m.ctxPct).padStart(4)}%`, color: 'text'}];
    return [...cap(items, w, 1, limit), clip(ctx, w)];
  }
  if (hiddenDone) items.push([{text: `  +${hiddenDone} more done`, color: 'dim'}]);
  const used = m.cats.filter(x => x.kind === 'used').reduce((n, x) => n + x.tokens, 0);
  const bar = stack(m, iw);
  const ctx: Seg[][] = [bar.segs];
  // Legend items packed into rows of at most iw cells, three spaces apart.
  let row: Seg[] = [];
  for (const x of bar.slices.filter(x => x.cells > 0)) {
    const item: Seg[] = [{text: '● ', color: x.color}, {text: `${x.label} ${x.pct}%`, color: 'dim'}];
    if (row.length && len([...row, sp(3), ...item]) > iw) {
      ctx.push(clip(row, iw));
      row = [];
    }
    row = row.length ? [...row, sp(3), ...item] : item;
  }
  if (row.length) ctx.push(clip(row, iw));
  const hist = history(m, iw);
  if (hist) ctx.push([], hist);
  return [
    ...section('PLAN', m.plan.length ? `${done}/${m.plan.length}` : '', items, w, look.border),
    [],
    ...section('CONTEXT', `${m.ctxPct}% · ${tokensK(used)} / ${tokensK(m.maxTokens)}`, ctx, w, look.border),
  ];
}

export function tabRows(m: Model, tab: TabId, look: Look, w: number, compact: boolean, limit = COMPACT_ROWS): Seg[][] {
  return tab === 'changes' ? changes(m, look, w, compact, limit) : tab === 'agents' ? agents(m, look, w, compact, limit) : plan(m, look, w, compact, limit);
}

// hpBar and hearts in hooks/layout.tsx.
function lifeSegs(look: Look, hp: boolean, width: number, used: number, what: string): Seg[] {
  const left = Math.max(0, Math.min(100, 100 - used));
  if (!hp) {
    const full = Math.max(0, Math.min(5, Math.ceil(left / 20)));
    return [{text: '♥'.repeat(full), color: 'fail'}, {text: '♡'.repeat(5 - full), color: 'dim'}, {text: `  ${what} ${left}% left`, color: 'dim'}].filter(s => s.text) as Seg[];
  }
  const short = width - (5 + `100% ${what} left`.length) < 5;
  const w = short ? Math.max(3, width - 9) : width - 5 - `100% ${what} left`.length;
  const n = Math.round((left / 100) * w);
  // Flat blocks in three bands, not the mod's smooth gradient, so the video stays on the pixel grid.
  const band = (i: number): Paint => (i < w / 3 ? look.c.fail : i < (2 * w) / 3 ? look.c.edit : look.c.pass);
  const blocks: Seg[] = Array.from({length: w}, (_, i) => ({text: i < n ? '█' : '░', color: i < n ? band(i) : 'faint'}));
  return [{text: 'HP ', color: 'accent', bold: true}, ...blocks, {text: short ? `  ${left}%` : `  ${left}% ${what} left`, color: 'dim'}];
}

// lifeRow in hooks/pane.tsx without the spend case: the demo session has no cost.
export function statusRows(m: Model, look: Look, hp: boolean, width: number): Seg[][] {
  const windows = [['five_hour', '5h limit'], ['seven_day', 'weekly limit']] as const;
  const tight = windows
    .flatMap(([kind, what]) => (m.limits ?? []).filter(l => l.kind === kind).map(l => ({used: Math.round(l.percentUsed), what})))
    .sort((a, b) => b.used - a.used)[0];
  const {used, what} = tight ?? {used: m.ctxPct, what: 'context'};
  const life = lifeSegs(look, hp, width, used, what);
  const rows: Seg[][] = [[{text: `${m.act.glyph} ${m.act.label}`, color: m.act.tone, bold: true}], life];
  const live = m.agents.filter(a => a.state === 'running');
  if (live.length) rows.push([{text: `◆ ${live.map(a => a.name).join(', ')} working`, color: 'agent'}]);
  return rows.map(r => clip(r, width));
}

// hooks/band.tsx: the action, subagents, hearts (or the arcade life bar from 80 columns) and plan progress.
export function bandSegs(m: Model, look: Look, hp: boolean, columns: number): Seg[] {
  const head: Seg[] = [{text: `${m.act.glyph} ${m.act.label}`, color: m.act.tone, bold: true}];
  const tail: Seg[] = [];
  const live = m.agents.filter(a => a.state === 'running').length;
  const dot: Seg = {text: '  ·  ', color: 'dim'};
  if (live) tail.push(dot, {text: `◆ ${live} subagent${live === 1 ? '' : 's'}`, color: 'agent'});
  const full = Math.max(0, Math.min(5, Math.ceil((100 - m.ctxPct) / 20)));
  tail.push(dot);
  if (hp && columns >= 80) tail.push(...lifeSegs(look, true, Math.min(34, Math.floor(columns * 0.3)), m.ctxPct, 'context'));
  else tail.push({text: '♥'.repeat(full), color: 'fail'}, {text: '♡'.repeat(5 - full), color: 'dim'});
  if (m.plan.length) {
    const done = m.plan.filter(p => p.status === 'completed').length;
    tail.push(dot, {text: '◇ ', color: 'dim'}, {text: '●'.repeat(done) + '○'.repeat(m.plan.length - done), color: 'accent'});
  }
  if (len(tail) + 8 > columns) return clip(head, columns);
  return [...clip(head, columns - len(tail)), ...tail];
}

// Everything the font draws on the cell grid itself stays in a run; any other glyph falls
// back to another font whose advance would push its neighbours off the grid, so each sits alone.
const SAFE = /[\x20-\x7e·…−▀-▐▖-▟]/;

// Box-drawing glyphs as rectangles. The font's line pieces leave gaps between rows (the row is taller than the em box),
// and its shade blocks do not keep the cell advance. Arms are up, down, left, right: 1 light, 2 heavy, 3 double.
// Rounded corners come out square.
const ARMS: Record<string, [number, number, number, number]> = {
  '─': [0, 0, 1, 1], '│': [1, 1, 0, 0], '━': [0, 0, 2, 2], '┃': [2, 2, 0, 0], '═': [0, 0, 3, 3], '║': [3, 3, 0, 0],
  '╭': [0, 1, 0, 1], '╮': [0, 1, 1, 0], '╰': [1, 0, 0, 1], '╯': [1, 0, 1, 0],
  '┌': [0, 1, 0, 1], '┐': [0, 1, 1, 0], '└': [1, 0, 0, 1], '┘': [1, 0, 1, 0],
  '┏': [0, 2, 0, 2], '┓': [0, 2, 2, 0], '┗': [2, 0, 0, 2], '┛': [2, 0, 2, 0],
  '╔': [0, 3, 0, 3], '╗': [0, 3, 3, 0], '╚': [3, 0, 0, 3], '╝': [3, 0, 3, 0],
};
const THICK = [0, 2, 4, 2];
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

export function drawSegs(T: Term, parent: Node, col: number, row: number, segs: Seg[]) {
  let x = col;
  for (const s of segs) {
    let run = '';
    let start = x;
    const flush = () => {
      if (run) T.txt(run, start, row, s.color, {bold: s.bold, parent});
      run = '';
    };
    for (const ch of s.text) {
      if (ARMS[ch]) {
        flush();
        const [up, down, left, right] = ARMS[ch];
        const cx = x * CW + CW / 2;
        const cy = row * LH + LH / 2;
        // Each arm reaches the cell edge; a double arm is two thin lines 4 px apart, with the same offset at a corner.
        const arm = (n: number, horizontal: boolean, sign: number) => {
          if (!n) return;
          const lines = n === 3 ? [-3, 3] : [0];
          for (const d of lines) {
            const t = THICK[n];
            const len = (horizontal ? CW : LH) / 2 + t / 2;
            const w = horizontal ? len : t;
            const h = horizontal ? t : len;
            const px = horizontal ? cx + (sign * len) / 2 - (sign * t) / 2 : cx + d;
            const py = horizontal ? cy + d : cy + (sign * len) / 2 - (sign * t) / 2;
            parent.add(<Rect x={px} y={py} width={w} height={h} fill={T.paint(s.color)} />);
          }
        };
        arm(up, false, -1);
        arm(down, false, 1);
        arm(left, true, -1);
        arm(right, true, 1);
      } else if (QUAD[ch] !== undefined && ch !== '█') {
        // Quadrant blocks are drawn as rectangles: the font's glyphs leave seams once the camera zooms.
        flush();
        for (let k = 0; k < 4; k++) {
          if (!(QUAD[ch] & (1 << k))) continue;
          parent.add(<Rect x={x * CW + (k % 2) * (CW / 2)} y={row * LH + (k >> 1) * (LH / 2)} width={CW / 2 + 0.5} height={LH / 2 + 0.5} offset={[-1, -1]} fill={T.paint(s.color)} />);
        }
      } else if (SAFE.test(ch)) {
        if (!run) start = x;
        run += ch;
      } else {
        flush();
        const t = (
          <Txt text={s.spin ? SPIN[0] : ch} x={x * CW + CW / 2} y={row * LH} offset={[0, -1]} fontFamily={FONT} fontSize={FS} lineHeight={LH} fontWeight={s.bold ? 700 : 400} fill={T.paint(s.color)} />
        ) as Txt;
        parent.add(t);
        if (s.spin) binders.push(() => t.text(SPIN[Math.floor((useTime() * 1000) / 90) % SPIN.length]));
      }
      x++;
    }
    flush();
  }
}
