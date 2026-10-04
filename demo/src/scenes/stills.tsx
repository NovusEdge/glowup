import {Node, Rect, Txt, makeScene2D} from '@revideo/2d';
import {all, waitFor} from '@revideo/core';
import {LookSig} from '../look';
import {Pet} from '../pixels';
import {Claude} from '../screen';
import {Stage} from '../stage';
import {CW, LH} from '../term';
import {C, HUD_H, HudState, PF, Spot, U, Veil, ground, hud} from '../game';

// Style stills: the real arcade-pack session on a 1920x1080 frame, a game HUD above it and
// dither/spotlight overlays on top. The terminal is scaled by 15/CW so one terminal cell is
// exactly 15 screen pixels wide; the HUD and title are on a 4 px grid.
const S0 = 15 / CW;
const PAD = 28;
const ROOT = {x: 0, y: (HUD_H + 1000 / 2) - 540};
// Sprite pixels sized so that, at S0, they are whole screen pixels (15 x 16).
const PIX = {pw: CW, ph: 16 / S0};

const FRAME = {x: 0, y: HUD_H, w: 1920, h: 1080 - HUD_H};

export default makeScene2D('stills', function* (view) {
  const stage = new Stage(view);
  yield stage.run();
  view.add(<Rect width={1920} height={1080} fill={C.deep} />);

  const look = LookSig.of('arcade');
  const c = new Claude(look, stage, {chrome: false, pix: PIX});
  const root = c.term.root;
  root.position([ROOT.x, ROOT.y]).scale(S0);
  view.add(root);

  // Terminal cell to screen pixel.
  const sx = (col: number) => 960 + ROOT.x + S0 * (-c.term.width / 2 + PAD + col * CW);
  const sy = (row: number) => 540 + ROOT.y + S0 * (-c.term.height / 2 + PAD + row * LH);

  let bar: Node | undefined;
  const setHud = (s: HudState) => {
    bar?.remove();
    bar = hud(s);
    view.add(bar);
  };
  const top: HudState = {lives: 3, maxLives: 3, level: 1, xp: 0, xpNext: 100, score: 0};
  setHud(top);

  // 1. Title screen over the dimmed, empty session.
  const title = (<Node />) as Node;
  const veil = new Veil({});
  veil.size = FRAME;
  title.add(veil);
  const plate = {w: 1160, h: 420, y: 420 - 540};
  title.add(<Rect x={16} y={plate.y + 16} width={plate.w} height={plate.h} fill={C.deep} />);
  title.add(<Rect y={plate.y} width={plate.w} height={plate.h} fill={C.bg} stroke={C.pink} lineWidth={8} />);
  title.add(<Rect y={plate.y} width={plate.w - 32} height={plate.h - 32} stroke={C.faint} lineWidth={U} />);
  const word = (text: string, x: number, y: number, size: number, fill: string) => (
    <Txt text={text} x={x} y={y} fontFamily={PF} fontSize={size} fill={fill} />
  );
  title.add(word('GLOWUP', 16, 346 - 540, 128, C.faint));
  title.add(word('GLOWUP', 8, 338 - 540, 128, C.pink));
  title.add(word('GLOWUP', 0, 330 - 540, 128, C.yellow));
  const start = word('PRESS START', 0, 480 - 540, 32, C.text);
  title.add(start);
  title.add(word('© 2026 NOVUSEDGE', 0, 570 - 540, 16, C.dim));
  title.add(ground(984, 96));
  const walker = new Pet(12, 12, -660, -960, 960);
  walker.sprite.y(984 - 540 - 12 * 12);
  title.add(walker.sprite);
  stage.tickers.push(t => {
    walker.update(t);
    start.opacity(Math.floor(t * 2) % 2 === 0 ? 1 : 0);
  });
  view.add(title);
  bar?.moveToTop();
  walker.play('walk');
  yield* waitFor(1.6);

  // 2. Gameplay: a passing run.
  title.remove();
  c.convo.add({k: 'user', text: 'add a dark mode toggle'});
  c.convo.add({k: 'tool', tool: 'Read', arg: 'theme.css'});
  c.convo.add({k: 'tool', tool: 'Edit', arg: 'theme.css', res: 'Added 12 lines, removed 3'});
  c.convo.add({k: 'tool', tool: 'Bash', arg: 'just test', res: '142 passed'});
  c.convo.add({k: 'asst', text: 'Dark mode toggle added. Tests are green.', xp: 40});
  c.act('✓', '142 passed', 'pass');
  c.set({ctxPct: 38});
  setHud({lives: 3, maxLives: 3, level: 2, xp: 60, xpNext: 100, score: 1240});
  c.pet.play('hop');
  yield* all(c.say('done', 0, {}, 1.6), waitFor(2));

  // 3. A failed run costs a heart; the focus lands on Clawd and his bubble.
  c.convo.clear();
  c.convo.add({k: 'user', text: 'run the tests'});
  c.convo.add({k: 'tool', tool: 'Bash', arg: 'just test', res: '1 failed: theme.test.ts', ok: false}, 'fail');
  c.convo.add({k: 'asst', text: 'theme.test.ts fails on the toggle. Fixing it.', xp: 15});
  c.act('✗', '1 failed: theme.test.ts', 'fail');
  setHud({lives: 2, maxLives: 3, level: 2, xp: 75, xpNext: 100, score: 1240});
  c.pet.play('fail');
  const spot = new Spot({});
  spot.hole = {x: sx(69), y: sy(17), w: 36 * 15, h: sy(26.4) - sy(17)};
  spot.area = FRAME;
  view.add(spot);
  bar?.moveToTop();
  const bubble = c.say('fail', 0, {n: 1}, 2.4);
  yield* waitFor(0.3);
  for (const l of [1, 2, 3]) {
    spot.level = l;
    yield* waitFor(0.1);
  }
  yield* bubble;
  yield* waitFor(0.2);
});
