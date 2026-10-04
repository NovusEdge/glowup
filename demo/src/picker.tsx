import {Node, Rect, Txt} from '@revideo/2d';
import {all, createRef, createSignal, easeInOutCubic, waitFor} from '@revideo/core';
import {THEMES, SPINNERS, lookOf} from './data';
import {LookSig} from './look';
import {Pet} from './pixels';
import {Stage, Region} from './stage';
import {CW, FONT, LH, SpinnerView, Term, binders} from './term';

// The installer's picker, rebuilt from installer/internal/tui: a step line, the form in the
// middle, Clawd and his bubble on the left, the live preview on the right.
const COLS = 104;
const ROWS = 24;
const FORM = 26;
const PREV = 58;
const PW = 44;
const TOP = 3;
const STEPS = ['Pack', 'Colors', 'Spinner', 'Pet', 'Extras'];

export class Picker {
  readonly term: Term;
  readonly pv: LookSig;
  readonly step = createSignal(0);
  readonly caption = createSignal('classic — stock Claude Code');
  readonly footer = createSignal('pet Clawd · bubbles on · motion full');
  private chrome: LookSig;
  private form: Node;
  private marker: Txt;
  private optionTxts: Txt[] = [];
  private frame: Rect;
  private toolBox: Rect;
  private spin: SpinnerView;
  readonly pet: Pet;
  pack = 'classic';
  theme = 'classic';
  spinner = 'pack';

  constructor(readonly stage: Stage) {
    this.chrome = LookSig.of('classic');
    this.pv = LookSig.of('classic');
    const T = (this.term = new Term(this.chrome, COLS, ROWS, 'glowup-installer'));
    const pv = this.pv;

    STEPS.forEach((s, i) => {
      const col = [0, 7, 16, 26, 32][i];
      T.txt(s, col, 1, () => (this.step() === i ? this.chrome.sig.accent() : this.chrome.sig.dim()), {bold: true});
      if (i) T.txt('›', col - 2, 1, 'dim');
    });

    // The preview box.
    this.frame = T.rect(PREV, TOP, PW, 19, {fill: pv.sig.bg, stroke: pv.sig.borderColor, lineWidth: 2, radius: 14}) as Rect;
    const P = (text: string | (() => string), col: number, row: number, color: any, bold = false) =>
      T.txt(text, PREV + 2 + col, TOP + 1 + row, color, {bold});
    const title = P(() => pv.title(), 0, 1, pv.sig.accent, true);
    P(() => pv.desc(), 0, 1, pv.sig.dim).x(() => PREV * CW + 2 * CW + (pv.title().length + 1) * CW);
    title.fill(pv.sig.accent);
    P('›', 0, 3, pv.sig.accent, true);
    P('add a dark mode toggle', 2, 3, pv.sig.text);
    P('●', 0, 4, pv.sig.accent);
    P('On it. Reading the styles first.', 2, 4, pv.sig.dim);
    this.toolBox = T.rect(PREV + 1, TOP + 1 + 6.5, PW - 2, 3, {stroke: pv.sig.dim, lineWidth: 2, radius: 12}) as Rect;
    T.rect(PREV + 1.5, TOP + 1 + 6, 19, 1, {fill: pv.sig.bg});
    P('● Edit', 1, 6, pv.sig.edit, true);
    P('theme.css', 8, 6, pv.sig.text);
    T.rect(PREV + 2 + 28, TOP + 1 + 6, 12, 1, {fill: pv.sig.bg});
    P('+12', 29, 6, pv.sig.pass);
    P('−3', 33, 6, pv.sig.fail);
    T.rect(PREV + 2, TOP + 1 + 7, PW - 4, 1, {fill: pv.sig.delBg});
    T.rect(PREV + 2, TOP + 1 + 8, PW - 4, 1, {fill: pv.sig.addBg});
    P(' − color: #111', 0, 7, pv.sig.fail);
    P(' + color: var(--fg)', 0, 8, pv.sig.pass);
    this.spin = new SpinnerView(pv, PREV + 2, TOP + 1 + 11, lookOf('classic').spinner);
    T.screen.add(this.spin.node);
    P(() => pv.word() + '…', 8, 11, pv.sig.spinTint);
    ['accent', 'text', 'read', 'edit', 'shell', 'agent', 'pass', 'fail'].forEach((k, i) => T.rect(PREV + 2 + i * 3, TOP + 1 + 14.1, 2, 0.8, {fill: (pv.sig as any)[k]}));
    P(() => this.footer(), 0, 15, pv.sig.dim);

    // Clawd and his bubble.
    this.pet = new Pet(CW, LH / 2, 0);
    this.pet.sprite.y((TOP + 12) * LH);
    T.screen.add(this.pet.sprite);
    const captionRef = createRef<Txt>();
    const bub = T.rect(0, TOP + 5.5, 24, 1.75, {stroke: pv.sig.accent, lineWidth: 2, radius: 12, fill: this.chrome.sig.bg});
    bub.add(
      <Txt
        ref={captionRef}
        text={this.caption()}
        fontFamily={FONT}
        fontSize={24}
        fill={this.chrome.sig.text}
        textWrap
        width={21 * CW}
        textAlign="left"
        offset={[-1, -1]}
        x={-12 * CW + CW}
        y={0}
        lineHeight={LH * 0.85}
      />,
    );

    // The bubble is as tall as its wrapped text and keeps its bottom edge over Clawd's head.
    const wrapLines = (text: string) => {
      let n = 1;
      let cur = 0;
      for (const w of text.split(' ')) {
        if (cur && cur + 1 + w.length > 24) {
          n++;
          cur = w.length;
        } else cur += (cur ? 1 : 0) + w.length;
      }
      return n;
    };
    const bottom = (TOP + 7.25) * LH;
    binders.push(() => {
      const text = this.caption();
      if (captionRef().text() !== text) captionRef().text(text);
      const h = (0.9 + 0.85 * wrapLines(text)) * LH;
      if (Math.abs(bub.height() - h) < 0.01) return;
      bub.height(h).y(bottom - h);
      captionRef().y(-h / 2 + LH * 0.45);
    });
    this.form = (<Node />) as Node;
    T.screen.add(this.form);
    this.marker = T.txt('>', FORM, TOP + 3, 'accent', {bold: true});
    T.txt('↑ up • ↓ down • enter submit', FORM, TOP + 15, 'dim', {size: 22});

    stage.tickers.push(t => {
      this.pet.update(t);
      this.spin.update(t);
    });
    this.restyle();
  }

  private restyle() {
    const b = this.pv.look.border;
    this.frame.lineWidth(b === 'bold' ? 4 : 2).radius(b === 'bold' ? 0 : 14);
    this.toolBox.radius(b === 'bold' ? 0 : 12);
    this.spin.anim = this.pv.look.spinner;
  }

  // The preview follows the cursor: colors tween, the rest switches at once.
  *apply(seconds = 0.25) {
    const look = lookOf(this.pack, this.theme, this.spinner);
    yield* this.pv.to(look, seconds);
    this.restyle();
  }

  get preview(): Region {
    return this.rect(PREV - 1, TOP - 1, PW + 2, 21);
  }

  get formAndPreview(): Region {
    return this.rect(FORM - 1, TOP - 1, PREV + PW - FORM + 2, 21);
  }

  rect(col: number, row: number, w: number, h: number, pad = 20): Region {
    const s = this.term.screen;
    return {x: s.x() + col * CW - pad, y: s.y() + row * LH - pad, w: w * CW + 2 * pad, h: h * LH + 2 * pad};
  }

  get whole(): Region {
    return {x: -this.term.width / 2, y: -this.term.height / 2, w: this.term.width, h: this.term.height};
  }

  // A fresh question: title, description, options, cursor on the first.
  ask(stepIdx: number, title: string, desc: string, options: string[]) {
    this.step(stepIdx);
    this.form.removeChildren();
    this.optionTxts = [];
    const T = this.term;
    T.txt(title, FORM, TOP, 'accent', {bold: true, parent: this.form});
    // The form is 32 cells wide; a longer description wraps onto a second line as huh does.
    const cut = desc.length > 38 ? desc.lastIndexOf(' ', 38) : -1;
    T.txt(cut < 0 ? desc : desc.slice(0, cut), FORM, TOP + 1, 'dim', {parent: this.form, size: 22});
    if (cut >= 0) T.txt(desc.slice(cut + 1), FORM, TOP + 2, 'dim', {parent: this.form, size: 22});
    options.forEach((o, i) => this.optionTxts.push(T.txt(o, FORM + 2, TOP + 3 + i, 'dim', {parent: this.form})));
    this.marker.y((TOP + 3) * LH);
    this.pick(0);
  }

  pick(i: number) {
    this.optionTxts.forEach((t, j) => t.fill(j === i ? this.chrome.sig.text() : this.chrome.sig.dim()));
    this.optionTxts[i].fontWeight(700);
    this.optionTxts.forEach((t, j) => j !== i && t.fontWeight(400));
  }

  *move(i: number, seconds = 0.12) {
    this.pick(i);
    yield* this.marker.y((TOP + 3 + i) * LH, seconds, easeInOutCubic);
  }

  *key(i: number, then: () => Generator | void, gap = 0.6) {
    const r = then();
    yield* all(this.move(i), r ? (r as any) : waitFor(0));
    yield* waitFor(gap);
  }
}

export const THEME_NAMES = ["Pack's own", ...THEMES.filter(t => t.name !== 'classic').map(t => t.name)];
export const SPINNER_IDS = ["Pack's own", ...SPINNERS.map(s => s.id)];
