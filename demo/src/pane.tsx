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
export type FileRow = {path: string; add: number; del: number; how: 'read' | 'edit' | 'new'};

export type Model = {
  working: boolean;
  act: Act;
  agents: AgentRow[];
  plan: PlanRow[];
  files: FileRow[];
  ctxPct: number;
  cats: Cat[];
  maxTokens: number;
};

export type Cat = {name: string; tokens: number; kind: string};

// hooks/ctxchart.ts without its imports: that file pulls in layout.tsx, which this project's JSX settings cannot type.
const SHORT: [RegExp, string][] = [[/system prompt/i, 'system'], [/system tools/i, 'tools'], [/mcp/i, 'mcp'], [/memory/i, 'memory'], [/messages?/i, 'messages']];
const shortName = (n: string) => SHORT.find(([re]) => re.test(n))?.[1] ?? n.toLowerCase().slice(0, 10);
const tokensK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

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

function changes(m: Model, w: number, compact: boolean, limit: number): Seg[][] {
  const edited = m.files.filter(f => f.how !== 'read');
  const add = edited.reduce((n, f) => n + f.add, 0);
  const del = edited.reduce((n, f) => n + f.del, 0);
  const rows: Seg[][] = [];
  if (!compact) rows.push(header('CHANGES', `${edited.length} files  +${add} −${del}`, w), []);
  const body: Seg[][] = [];
  if (!m.files.length) body.push([{text: '  Nothing changed yet.', color: 'dim'}]);
  for (const f of compact ? edited : m.files) {
    const read = f.how === 'read';
    const left: Seg[] = [{text: '  ', color: 'text'}, {text: read ? '▸ ' : '✎ ', color: read ? 'read' : 'edit'}, {text: f.path + (f.how === 'new' ? '  new' : ''), color: read ? 'dim' : 'text'}];
    const right: Seg[] = read ? [{text: 'read', color: 'dim'}] : [{text: `+${f.add}`, color: 'pass'}, {text: ` −${f.del}`, color: 'fail'}];
    body.push(spread(left, right, w));
  }
  return [...rows, ...(compact ? cap(body, w, 0, limit) : body)];
}

function agents(m: Model, w: number, compact: boolean, limit: number): Seg[][] {
  const live = m.agents.filter(a => a.state === 'running').length;
  const rows: Seg[][] = [];
  if (!compact) rows.push(header('AGENTS', `${live} running · ${m.agents.length - live} done`, w), []);
  const body: Seg[][] = [];
  if (!m.agents.length) body.push([{text: '  No subagents this session.', color: 'dim'}]);
  for (const a of m.agents) {
    const running = a.state === 'running';
    const mark: Seg = running ? {text: '⠋', color: 'agent', spin: true} : {text: '✓', color: 'pass'};
    if (compact) {
      body.push(clip([{text: ` ◆ ${a.name} `, color: 'agent', bold: true}, mark, {text: ' ' + (running ? a.now ?? a.task : a.task), color: running ? 'read' : 'dim'}], w));
      continue;
    }
    body.push(spread([{text: '◆ ' + a.name, color: 'agent', bold: true}], [{text: `${a.secs}s · ${(a.tokens / 1000).toFixed(1)}k `, color: 'dim'}, mark], w));
    body.push(clip([{text: '  ' + a.task, color: 'text'}], w));
    if (running && a.now) body.push(clip([{text: '  └ ', color: 'faint'}, {text: a.now, color: 'read'}], w));
    body.push([]);
  }
  return [...rows, ...(compact ? cap(body, w, 0, limit) : body)];
}

const rule = (label: string, right: string, w: number): Seg[] => {
  const head = ` ${label} `;
  const tail = right ? ` ${right}` : '';
  return clip([{text: ' ', color: 'text'}, {text: label, color: 'text', bold: true}, {text: ' ' + '─'.repeat(Math.max(1, w - head.length - tail.length - 1)), color: 'faint'}, {text: tail, color: 'dim'}], w);
};

// The roles palette() in hooks/ctxchart.ts hands out, in its order.
const STACK = ['read', 'agent', 'shell', 'edit', 'accent'] as const;

function stack(m: Model, width: number) {
  const slices = stackBar(m.cats, m.maxTokens, width);
  const segs: Seg[] = slices.filter(x => x.cells > 0).map((x, i) => ({text: '█'.repeat(x.cells), color: STACK[i] ?? 'text'}));
  const used = slices.reduce((n, x) => n + x.cells, 0);
  if (width - used > 0) segs.push({text: '·'.repeat(width - used), color: 'faint'});
  return {segs, slices};
}

function planRow(p: PlanRow, w: number): Seg[] {
  const on = p.status === 'in_progress';
  const done = p.status === 'completed';
  return clip([{text: `  ${done ? '✓' : on ? '◉' : '○'} `, color: done ? 'pass' : on ? 'accent' : 'dim'}, {text: on && p.active ? p.active : p.title, color: done ? 'dim' : 'text', bold: on}], w);
}

function plan(m: Model, look: Look, w: number, compact: boolean, limit: number): Seg[][] {
  const done = m.plan.filter(p => p.status === 'completed').length;
  const {items: shown, hiddenDone} = planOrder(m.plan as never);
  const items = (shown as unknown as PlanRow[]).map(p => planRow(p, w));
  if (!m.plan.length) items.push([{text: '  No task list yet.', color: 'dim'}]);
  if (compact) {
    const inner = Math.max(4, w - 12);
    const bar = stack(m, inner);
    const ctx: Seg[] = [{text: ' ctx ▕', color: 'dim'}, ...bar.segs, {text: `▏${String(m.ctxPct).padStart(4)}%`, color: 'text'}];
    return [...cap(items, w, 1, limit), clip(ctx, w)];
  }
  if (hiddenDone) items.push([{text: `    +${hiddenDone} more done`, color: 'dim'}]);
  const used = m.cats.filter(x => x.kind === 'used').reduce((n, x) => n + x.tokens, 0);
  const rows: Seg[][] = [rule('PLAN', m.plan.length ? `${done}/${m.plan.length}` : '', w), ...items, [{text: '├' + '─'.repeat(w - 2) + '┤', color: 'faint'}]];
  rows.push(rule('CONTEXT', `${m.ctxPct}% · ${tokensK(used)} / ${tokensK(m.maxTokens)}`, w));
  const bar = stack(m, Math.max(1, w - 3));
  rows.push([{text: ' ▕', color: 'faint'}, ...bar.segs, {text: '▏', color: 'faint'}]);
  // Legend items packed into rows of at most w cells, indented three.
  let row: Seg[] = [];
  const legend: Seg[][] = [];
  bar.slices.filter(x => x.cells > 0).forEach((x, i) => {
    const item: Seg[] = [{text: '● ', color: STACK[i] ?? 'text'}, {text: `${x.label} ${x.pct}%`, color: 'dim'}];
    if (row.length && len([...row, sp(2), ...item]) > w) {
      legend.push(row);
      row = [];
    }
    row = [...row, {text: row.length ? '  ' : '   ', color: 'text'}, ...item];
  });
  if (row.length) legend.push(row);
  return [...rows, ...legend.map(r => clip(r, w))];
}

export function tabRows(m: Model, tab: TabId, look: Look, w: number, compact: boolean, limit = COMPACT_ROWS): Seg[][] {
  return tab === 'changes' ? changes(m, w, compact, limit) : tab === 'agents' ? agents(m, w, compact, limit) : plan(m, look, w, compact, limit);
}

export function statusRows(m: Model, look: Look, hp: boolean, width: number): Seg[][] {
  const used = m.ctxPct;
  const left = 100 - used;
  const full = Math.max(0, Math.min(5, Math.ceil(left / 20)));
  const life: Seg[] = hp
    ? (() => {
        const w = width - 22;
        const n = Math.round((left / 100) * w);
        // Flat blocks in three bands, not the mod's smooth gradient, so the video stays on the pixel grid.
        const band = (i: number): Paint => (i < w / 3 ? look.c.fail : i < (2 * w) / 3 ? look.c.edit : look.c.pass);
        const blocks: Seg[] = Array.from({length: w}, (_, i) => ({text: '█', color: i < n ? band(i) : 'faint'}));
        return [{text: 'HP ', color: 'accent', bold: true}, ...blocks, {text: `  ${left}% context left`, color: 'dim'}] as Seg[];
      })()
    : [{text: '♥'.repeat(full), color: 'fail'}, {text: '♡'.repeat(5 - full), color: 'dim'}, {text: `  context ${left}% left`, color: 'dim'}];
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
  if (hp && columns >= 80) tail.push(...statusRows(m, look, true, Math.min(34, Math.floor(columns * 0.3)))[1]);
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
const SAFE = /[\x20-\x7e·…−─-▟]/;
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
      if (QUAD[ch] !== undefined && ch !== '█') {
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
