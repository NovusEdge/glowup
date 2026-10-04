import {Gradient, Rect, Txt, makeScene2D} from '@revideo/2d';
import {all, delay, easeOutCubic, linear, waitFor, ThreadGenerator} from '@revideo/core';
import {CLAWD_SHEET, SPINNERS, lookOf, pack, say} from '../data';
import {LookSig} from '../look';
import {Picker, SPINNER_IDS, THEME_NAMES} from '../picker';
import {Pet} from '../pixels';
import {Claude} from '../screen';
import {Stage} from '../stage';
import {Block, CW, Entry, FONT} from '../term';

const INSTALL = 'curl -fsSL https://glowup.khimani.dev/install.sh | sh';

const EDIT_DEMO: Entry[] = [
  {k: 'user', text: 'add a dark mode toggle'},
  {k: 'tool', tool: 'Read', arg: 'theme.css'},
  {k: 'tool', tool: 'Edit', arg: 'theme.css', res: 'Added 12 lines, removed 3'},
  {k: 'asst', text: 'Dark mode toggle added.', xp: 40},
];

const accentOf = (name: string) => pack(name).colors.accent;

// A pack switch as the person sees it: the command, then every color tweens while the rows
// are rebuilt in the new pack's style and drop in one after another.
function* switchPack(c: Claude, name: string, entries: Entry[], seconds = 0.4): ThreadGenerator {
  const rebuild = function* (): ThreadGenerator {
    yield* waitFor(seconds * 0.5);
    c.convo.clear();
    c.restyle();
    const blocks = entries.map(e => c.convo.add(e, 'ok', false));
    for (const b of blocks) yield* all(c.convo.show(b, 0.2), waitFor(0.07));
  };
  yield* all(c.look.to(lookOf(name), seconds), rebuild());
}

function fill(c: Claude, entries: Entry[]) {
  entries.forEach(e => c.convo.add(e, 'ok'));
}

function* finish(b: Block, ok: boolean) {
  b.status(ok ? 'ok' : 'fail');
  b.res?.opacity(1);
  yield* waitFor(0);
}

function* hook(stage: Stage, c: Claude): ThreadGenerator {
  const {x: W, y: H} = stage.size;
  const title = (
    <Txt
      text="glowup"
      fontFamily="JetBrains Mono"
      fontWeight={700}
      fontSize={Math.min(130, W * 0.11)}
      y={-H / 2 + Math.min(130, W * 0.11)}
      fill={new Gradient({from: [-300, 0], to: [300, 0], stops: [{offset: 0, color: '#d77757'}, {offset: 1, color: '#8dffb0'}]})}
      opacity={0}
    />
  ) as Txt;
  stage.overlay.add(title);
  yield title.opacity(1, 0.35, easeOutCubic);
  yield* waitFor(0.5);
  yield* c.type('/glowup pack crt', 0.45);
  yield* waitFor(0.1);
  c.prompt.text('');
  yield* switchPack(c, 'crt', EDIT_DEMO, 0.35);
  yield* waitFor(0.3);
  yield title.opacity(0, 0.2);
}

function* clawd(stage: Stage, c: Claude): ThreadGenerator {
  yield delay(0.5, stage.caption('Clawd reacts to your tests', accentOf('classic'), 5.6));
  yield stage.focus(c.whole, 0.01);
  c.pet.play('idle');
  yield* all(c.type('run the tests', 0.5), stage.focus(c.whole, 0.8, {rot: 0.5}));
  c.prompt.text('');
  const u = c.convo.add({k: 'user', text: 'run the tests'}, 'ok', false);
  yield* c.convo.show(u, 0.2);
  const t1 = c.convo.add({k: 'tool', tool: 'Bash', arg: 'just test', res: '142 passed'}, 'run', false);
  yield* c.convo.show(t1, 0.2);
  c.showSpinner(true);
  c.pet.play('working');
  yield* waitFor(0.8);

  yield* finish(t1, true);
  c.showSpinner(false);
  c.pet.play('hop');
  yield* all(c.say(say('done', 0), 0.9), waitFor(c.pet.duration('hop')));
  c.pet.play('done');
  yield* waitFor(0.6);
  c.pet.play('walk');
  yield* waitFor(0.5);
  c.pet.play('idle');

  const t2 = c.convo.add({k: 'tool', tool: 'Bash', arg: 'just test', res: '1 failed: theme.test.ts', ok: false}, 'run', false);
  yield* c.convo.show(t2, 0.2);
  c.showSpinner(true);
  c.pet.play('working');
  yield* waitFor(0.7);
  yield* finish(t2, false);
  c.showSpinner(false);
  c.pet.play('fail');
  yield* all(c.say(say('fail', 0, {n: 1}), 1.4), waitFor(c.pet.duration('fail')));
  const reply = c.convo.add({k: 'asst', text: 'theme.test.ts fails on the toggle. Fixing it.', xp: 15}, 'ok', false);
  yield* c.convo.show(reply, 0.3);
  yield* waitFor(0.5);
}

const TOUR = ['classic', 'crt', 'cozy', 'arcade'];

function* tour(stage: Stage, c: Claude): ThreadGenerator {
  c.showSpinner(true);
  for (const [i, name] of TOUR.entries()) {
    const p = pack(name);
    yield delay(0.3, stage.caption(`${name} — ${p.description}`, p.colors.accent, 1.6));
    yield* c.type(`/glowup pack ${name}`, 0.4);
    c.prompt.text('');
    const regions = [
      stage.focus(c.whole, 0.9, {rot: -0.8}),
      stage.focus(c.whole, 0.9, {rot: 0.6}),
      stage.focus(c.whole, 0.9, {rot: -0.6}),
      stage.focus(c.whole, 0.9, {rot: 0.8}),
    ];
    if (i === 0) {
      yield* all(waitFor(0.5), regions[i]);
    } else {
      yield* all(switchPack(c, name, EDIT_DEMO, 0.4), regions[i]);
    }
    yield* waitFor(0.45);
  }
}

function* installer(stage: Stage, p: Picker): ThreadGenerator {
  yield delay(0.3, stage.caption('pick a look before you start', '#38e8ff', 6.3));
  const say = (text: string) => p.caption(text);

  // Pack: walk the list so the preview recolors.
  p.ask(0, 'Pick a pack', 'Change later: /glowup pack', TOUR);
  yield* all(waitFor(0.5), stage.focus(p.whole, 0.7, {rot: 0.4}));
  for (const [i, name] of TOUR.entries()) {
    if (i === 0) continue;
    p.pack = name;
    say(`${name} — ${pack(name).description}`);
    yield* all(p.move(i), p.apply(0.3));
    yield* waitFor(0.2);
  }

  p.ask(0, 'Use arcade as is?', 'Customize picks colors and spinner on their own.', ['Use arcade as is', 'Customize']);
  yield* waitFor(0.3);
  yield* p.move(1);
  yield* waitFor(0.3);

  yield* stage.focus(p.whole, 0.7, {rot: -0.4});
  p.ask(1, 'Pick the colors', 'The pack\'s own, or a theme.', THEME_NAMES);
  say('arcade — its own colors');
  for (const i of [2, 3, 4]) {
    p.theme = THEME_NAMES[i];
    say(`${p.theme} — theme colors`);
    yield* all(p.move(i), p.apply(0.3));
    yield* waitFor(0.3);
  }

  p.ask(2, 'Pick the spinner', 'The pack\'s own, or any spinner.', SPINNER_IDS);
  for (const i of [2, 3, 5]) {
    p.spinner = SPINNER_IDS[i];
    const s = SPINNERS.find(x => x.id === p.spinner)!;
    say(`${s.id} — ${s.name}`);
    yield* all(p.move(i), p.apply(0.2));
    yield* waitFor(0.5);
  }

  p.ask(3, 'Pick a pet', '', ['Clawd', 'No pet']);
  say('Clawd — your pet');
  yield* waitFor(0.4);
  p.ask(4, 'Speech bubbles', '', ['On', 'Off']);
  say('bubbles on, motion full');
  yield* waitFor(0.3);
  yield* stage.focus(p.whole, 0.8, {rot: 0.3});
}

function* endCard(stage: Stage, bg: Rect, pet: Pet, cmd: Txt): ThreadGenerator {
  yield* waitFor(0.3);
  pet.play('walk');
  yield* cmd.text(`$ ${INSTALL}`, 1.2, linear);
  yield* waitFor(0.3);
  pet.play('hop');
  yield* waitFor(pet.duration('hop'));
  yield* waitFor(1.3);
}

export default makeScene2D('launch', function* (view) {
  const stage = new Stage(view);
  yield stage.run();

  // 0-2 s: the stock window turns into crt.
  const look = LookSig.of('classic');
  const c = new Claude(look, stage);
  fill(c, EDIT_DEMO);
  stage.setWorld(c.term.root);
  stage.jump(c.whole, {scale: stage.fit(c.whole) * 0.68});
  stage.world.y(stage.world.y() + 60);
  c.pet.play('idle');
  yield* hook(stage, c);

  // 2-10 s: Clawd.
  let c2!: Claude;
  yield* stage.wipe(accentOf('classic'), () => {
    stage.reset();
    c2 = new Claude(LookSig.of('classic'), stage);
    stage.setWorld(c2.term.root);
    stage.jump(c2.whole);
  });
  yield* clawd(stage, c2);

  // 10-20 s: packs tour.
  let c3!: Claude;
  yield* stage.wipe(accentOf('crt'), () => {
    stage.reset();
    c3 = new Claude(LookSig.of('classic'), stage);
    fill(c3, EDIT_DEMO);
    stage.setWorld(c3.term.root);
    stage.jump(c3.whole);
  });
  yield* tour(stage, c3);

  // 20-28 s: the installer picker.
  let p!: Picker;
  yield* stage.wipe(accentOf('arcade'), () => {
    stage.reset();
    p = new Picker(stage);
    stage.setWorld(p.term.root);
    stage.jump(p.whole);
  });
  yield* installer(stage, p);

  // 28-34 s: end card.
  const {x: W, y: H} = stage.size;
  let pet!: Pet;
  let cmd!: Txt;
  let bg!: Rect;
  yield* stage.wipe(accentOf('crt'), () => {
    stage.reset();
    const world = (<Rect width={W} height={H} fill="#07070a" />) as Rect;
    bg = world;
    const big = Math.min(190, W * 0.15);
    world.add(
      <Txt
        text="glowup"
        fontFamily={FONT}
        fontWeight={700}
        fontSize={big}
        y={-H * 0.27}
        fill={new Gradient({from: [-big * 1.8, 0], to: [big * 1.8, 0], stops: [{offset: 0, color: '#ff3ec8'}, {offset: 1, color: '#38e8ff'}]})}
      />,
    );
    world.add(<Txt text="a look for Claude Code" fontFamily={FONT} fontSize={Math.min(38, W * 0.03)} y={-H * 0.27 + big * 0.85} fill="#9b86c9" />);
    const fs = Math.min(34, (W * 0.9) / ((INSTALL.length + 6) * 0.6));
    const boxW = (INSTALL.length + 6) * fs * 0.6;
    const box = (<Rect width={boxW} height={fs * 2.6} y={H * 0.02} radius={16} fill="#0a1a0c" stroke="#33ff66" lineWidth={3} />) as Rect;
    cmd = (<Txt text="" fontFamily={FONT} fontSize={fs} fill="#33ff66" offset={[-1, 0]} x={-boxW / 2 + fs * 1.2} />) as Txt;
    box.add(cmd);
    world.add(box);
    world.add(<Txt text="github.com/NovusEdge/glowup" fontFamily={FONT} fontSize={Math.min(36, W * 0.03)} y={H * 0.02 + fs * 3.4} fill="#f4a6b8" />);
    const pw = Math.min(CW * 1.2, (W * 0.3) / 24);
    const sw = CLAWD_SHEET.w * pw;
    pet = new Pet(pw, pw * 1.15, -W / 2 + 30, -W / 2 + 30, W / 2 - 30 - sw);
    pet.sprite.y(H / 2 - CLAWD_SHEET.h * pw * 1.15 - 30);
    world.add(pet.sprite);
    stage.tickers.push(t => pet.update(t));
    stage.setWorld(world);
    stage.jump({x: -W / 2, y: -H / 2, w: W, h: H}, {scale: 1});
  });
  yield* endCard(stage, bg, pet, cmd);
});
