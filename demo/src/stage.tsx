import {Node, Rect, Txt, View2D} from '@revideo/2d';
import {Vector2, all, easeInCubic, easeInOutCubic, easeOutCubic, useTime, waitFor, ThreadGenerator} from '@revideo/core';
import {FONT, binders} from './term';

export type Region = {x: number; y: number; w: number; h: number};

// Revideo's 2D package has no camera node, so this is one: the world node is scaled,
// rotated and moved so a region of it lands in the middle of the frame, and the tweens
// are eased. Captions and wipes live on the view, outside the camera.
export class Stage {
  world: Node;
  readonly tickers: ((t: number) => void)[] = [];
  readonly overlay: Node;
  private scale = 1;

  constructor(readonly view: View2D) {
    this.world = (<Node />) as Node;
    this.overlay = (<Node />) as Node;
    view.add(this.world);
    view.add(this.overlay);
  }

  get size() {
    return this.view.size();
  }

  *run(): ThreadGenerator {
    while (true) {
      const t = useTime();
      for (const f of this.tickers) f(t);
      for (const f of binders) f();
      yield;
    }
  }

  reset() {
    this.tickers.length = 0;
    binders.length = 0;
  }

  // Scale that fits region in the frame with a margin; `max` keeps tiny regions from zooming into mush.
  fit(r: Region, margin = 0.92, max = 3) {
    const s = Math.min((this.size.x * margin) / r.w, (this.size.y * margin) / r.h);
    return Math.min(s, max);
  }

  private pose(r: Region, s: number, rot: number) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const a = (rot * Math.PI) / 180;
    // Screen point = s * R(rot) * p + pos; put the region's centre at the frame centre.
    const pos = new Vector2(-s * (Math.cos(a) * cx - Math.sin(a) * cy), -s * (Math.sin(a) * cx + Math.cos(a) * cy));
    return {pos, s, rot};
  }

  jump(r: Region, o: {scale?: number; rot?: number} = {}) {
    const p = this.pose(r, o.scale ?? this.fit(r), o.rot ?? 0);
    this.world.position(p.pos).scale(p.s).rotation(p.rot);
  }

  *focus(r: Region, seconds: number, o: {scale?: number; rot?: number; ease?: (t: number) => number} = {}) {
    const p = this.pose(r, o.scale ?? this.fit(r), o.rot ?? 0);
    const ease = o.ease ?? easeInOutCubic;
    yield* all(this.world.position(p.pos, seconds, ease, Vector2.lerp), this.world.scale(p.s, seconds, ease), this.world.rotation(p.rot, seconds, ease));
  }

  // The scene is swapped while the bar covers the frame.
  *wipe(color: string, swap: () => void, seconds = 0.55): ThreadGenerator {
    const {x: w, y: h} = this.size;
    const bar = (<Rect width={w * 0.9} height={h * 2.2} rotation={14} x={-w * 1.2} fill={color} />) as Rect;
    const edge = (<Rect width={w * 0.05} height={h * 2.2} rotation={14} x={-w * 1.2} fill="#ffffff" opacity={0.85} />) as Rect;
    this.overlay.add(bar);
    this.overlay.add(edge);
    yield* all(
      bar.x(w * 1.2, seconds, easeInOutCubic),
      edge.x(w * 1.2 + w * 0.47, seconds, easeInOutCubic),
      (function* () {
        yield* waitFor(seconds * 0.5);
        swap();
      })(),
    );
    bar.remove();
    edge.remove();
  }

  *caption(text: string, accent: string, hold: number): ThreadGenerator {
    const fs = Math.round(Math.min(46, (this.size.x * 0.9) / (text.length * 0.6 + 4)));
    const w = text.length * fs * 0.6 + 100;
    const y = this.size.y / 2 - 110;
    const pill = (
      <Rect width={w} height={fs * 2} y={y + 24} radius={fs} fill="#05050acc" stroke={accent} lineWidth={3} opacity={0}>
        <Txt text={text} fontFamily={FONT} fontWeight={700} fontSize={fs} fill="#ffffff" />
      </Rect>
    ) as Rect;
    this.overlay.add(pill);
    yield* all(pill.opacity(1, 0.28, easeOutCubic), pill.y(y, 0.28, easeOutCubic));
    yield* waitFor(hold);
    yield* all(pill.opacity(0, 0.25, easeInCubic), pill.y(y - 14, 0.25, easeInCubic));
    pill.remove();
  }

  setWorld(n: Node) {
    this.world.remove();
    this.world = n;
    this.view.add(n);
    n.moveToBottom();
  }
}
