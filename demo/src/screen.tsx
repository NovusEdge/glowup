import {Rect, Txt} from '@revideo/2d';
import {linear, waitFor} from '@revideo/core';
import {LookSig} from './look';
import {Pet} from './pixels';
import {Stage, Region} from './stage';
import {CW, Convo, FONT, LH, SpinnerView, Term} from './term';

// A square frame gets a narrower window so it fills the frame instead of sitting in a strip.
const colsFor = (s: {x: number; y: number}) => (s.x / s.y > 1.3 ? 88 : 64);
export const ROWS = 24;
const BAND_ROW = 14;
const PROMPT_ROW = 20;

// A Claude Code window with glowup on top: conversation, spinner, Clawd's band, the prompt box.
export class Claude {
  readonly term: Term;
  readonly convo: Convo;
  readonly spin: SpinnerView;
  readonly pet: Pet;
  readonly cols: number;
  readonly prompt: Txt;
  private box!: Rect;
  private cursor!: Rect;
  private bubble!: Rect;
  private bubbleText!: Txt;
  private spinLabel: Txt;
  private escLabel: Txt;

  constructor(readonly look: LookSig, readonly stage: Stage) {
    const COLS = (this.cols = colsFor(stage.size));
    const T = (this.term = new Term(look, COLS, ROWS));
    T.txt('✻ Claude Code', 0, 0, 'accent', {bold: true});
    T.txt('/help for help', 15, 0, 'dim');
    this.convo = new Convo(T);

    this.spin = new SpinnerView(look, 0, 12, look.look.spinner);
    T.screen.add(this.spin.node);
    this.spinLabel = T.txt(() => look.word() + '…', 6, 12, 'spinTint');
    this.escLabel = T.txt('(esc to interrupt)', 6, 13, 'dim');
    this.showSpinner(false);

    this.pet = new Pet(CW, LH / 2, 22 * CW, 0, (COLS - 24) * CW);
    this.pet.sprite.y(BAND_ROW * LH);
    T.screen.add(this.pet.sprite);

    this.box = T.rect(0, PROMPT_ROW + 0.5, COLS, 2, {stroke: look.sig.borderColor, lineWidth: 2, radius: 14}) as Rect;
    T.txt('>', 1, PROMPT_ROW + 1, 'accent', {bold: true});
    this.prompt = T.txt('', 3, PROMPT_ROW + 1, 'text');
    this.cursor = T.rect(3, PROMPT_ROW + 1.1, 0.6, 0.8, {fill: look.sig.accent}) as Rect;
    T.txt('? for shortcuts', 0, 23, 'dim');
    const tag = T.txt(() => 'glowup · ' + look.title(), 0, 23, 'accent');
    tag.offset([1, -1]).x(COLS * CW);

    this.bubble = (<Rect height={LH * 1.5} fill={look.sig.panel} stroke={look.sig.accent} lineWidth={2} radius={14} opacity={0} />) as Rect;
    this.bubbleText = (<Txt fontFamily={FONT} fontSize={24} fill={look.sig.text} />) as Txt;
    this.bubble.add(this.bubbleText);
    T.screen.add(this.bubble);

    this.restyle();
    stage.tickers.push(t => {
      this.pet.update(t);
      this.spin.update(t);
      this.cursor.opacity(Math.floor(t * 2) % 2 === 0 ? 1 : 0.15);
      this.cursor.x(3 * CW + this.prompt.text().length * CW);
      const w = this.bubble.width();
      this.bubble.x(Math.min(this.pet.x + 18 * CW + w / 2, COLS * CW - w / 2));
    });
  }

  // Everything that follows the pack's own style rather than its colors.
  restyle() {
    const b = this.look.look.border;
    this.box.lineWidth(b === 'bold' ? 4 : 2).radius(b === 'bold' ? 0 : 14);
    this.spin.anim = this.look.look.spinner;
  }

  showSpinner(on: boolean) {
    const o = on ? 1 : 0;
    this.spin.node.opacity(o);
    this.spinLabel.opacity(o);
    this.escLabel.opacity(o);
  }

  region(col: number, row: number, w: number, h: number, pad = 16): Region {
    const s = this.term.screen;
    return {x: s.x() + col * CW - pad, y: s.y() + row * LH - pad, w: w * CW + 2 * pad, h: h * LH + 2 * pad};
  }

  get whole(): Region {
    return {x: -this.term.width / 2, y: -this.term.height / 2, w: this.term.width, h: this.term.height};
  }

  // The band Clawd lives in, with the spinner and the tool rows above it.
  get petRegion(): Region {
    return this.region(0, BAND_ROW - 3, 56, 9);
  }

  *type(text: string, seconds: number) {
    yield* this.prompt.text(text, seconds, linear);
  }

  *send() {
    this.prompt.text('');
    yield* waitFor(0);
  }

  *say(text: string, hold = 1.2) {
    this.bubbleText.text(text);
    const w = text.length * 14.4 + 40;
    this.bubble.y((BAND_ROW + 1.4) * LH).width(w);
    yield* this.bubble.opacity(1, 0.15);
    yield* waitFor(hold);
    yield* this.bubble.opacity(0, 0.2);
  }
}
