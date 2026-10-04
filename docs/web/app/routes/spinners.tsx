import { useMemo, useState } from 'react'
import { SPINNERS, type Cell, type OrbState, type SpinnerId } from '../../../../hooks/motion.ts'
import { CLAWD_SHEET, frameAt, halfBlock } from '../../../../hooks/pets.ts'
import type { Look } from '../../../../hooks/packs.ts'
import { Cells, MotionToggle, PackSwitch, SpinnerView, Term, lookOf, useClock } from '../lab'
import type { Route } from './+types/spinners'

export const meta: Route.MetaFunction = () => [
  { title: 'Spinner lab · glowup' },
  { name: 'description', content: 'Every glowup spinner, live, in each built-in pack, and Clawd\'s animations.' },
]

const ORB: OrbState[] = ['think', 'search', 'work', 'run', 'agents']
const ORB_NOTE: Record<OrbState, string> = {
  think: 'the model is reasoning',
  search: 'a search is running',
  work: 'an edit is in flight',
  run: 'a shell command is running',
  agents: 'subagents are working',
}

function Card({ title, note, look, now, id, state }: { title: string; note: string; look: Look; now: number; id: SpinnerId; state?: OrbState }) {
  const l = useMemo(() => ({ ...look, motion: { ...look.motion, spinner: id } }), [look, id])
  return (
    <article className="lab-card">
      <Term look={look} className="lab-term"><SpinnerView look={l} now={now} state={state} name={title} /></Term>
      <h3>{title}</h3>
      <p>{note}</p>
    </article>
  )
}

const NOTES: Record<SpinnerId, string> = {
  stock: 'Claude Code\'s own six glyph cycle.',
  comet: 'A braille comet on an orbit, 3 by 2 cells.',
  eyes: 'Two eyes that look around and blink, in half blocks.',
  'orb-states': 'A braille sphere whose motion follows what Claude is doing. It cycles through the states here.',
  clawd: 'Clawd waving, in the quadrant blocks Claude Code uses.',
  shimmer: 'The stock glyph with a bold wave through the word.',
}

const TAIL_MS = 800
const toCells = (px: string[], palette: Record<string, string>): Cell[][] =>
  halfBlock(px, palette).map(r => r.flatMap(s => [...s.text].map(ch => ({ ch, fg: s.color, ...(s.bg ? { bg: s.bg } : {}) }))))

const ANIM_NOTE: Record<string, string> = {
  idle: 'Breathes, looks around, blinks.',
  walk: 'Heads right while Claude works.',
  'walk-left': 'The same walk, turned around.',
  hop: 'A flip when a test passes.',
  alert: 'Jumps and flags a question for you.',
  done: 'Confetti when a turn ends well.',
  sleep: 'Curls up after ten idle minutes.',
  working: 'Types at a keyboard.',
  fail: 'Sags and sweats when a test fails.',
}

function Clawd({ look, now }: { look: Look; now: number }) {
  const sheet = CLAWD_SHEET
  const [gold, setGold] = useState(false)
  return (
    <section aria-labelledby="clawd" className="lab-sec">
      <div className="lab-head">
        <h2 id="clawd" className="section-h">Clawd</h2>
        <button type="button" className="chip" aria-pressed={gold} onClick={() => setGold(!gold)}>Shiny</button>
      </div>
      <p className="section-p">The pet at the bottom of the pane. Each animation is a few hand-drawn frames, shown here at their real timings.</p>
      <div className="lab-grid">
        {Object.entries(sheet.animations).map(([name, anim]) => {
          const total = anim.frames.reduce((n, f) => n + f.ms, 0)
          const t = anim.loop ? now : now % (total + TAIL_MS)
          const frame = anim.frames[frameAt(anim, t)]!
          const palette = gold ? { ...sheet.palette, ...sheet.shiny } : sheet.palette
          return (
            <article className="lab-card" key={name}>
              <Term look={look} className="lab-term"><Cells rows={toCells(frame.px, palette)} label={`Clawd ${name}`} size="sm" /></Term>
              <h3>{name}</h3>
              <p>{ANIM_NOTE[name] ?? ''}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default function Spinners() {
  const [pack, setPack] = useState('classic')
  const clock = useClock()
  const look = useMemo(() => lookOf(pack), [pack])
  const orbNow = ORB[Math.floor(clock.now / 3000) % ORB.length]!
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6 sm:py-14">
      <p className="label mb-4 !text-(--accent)">Spinner lab</p>
      <h1 className="lab-h1">Every spinner, live</h1>
      <p className="hero-pitch">These are the cells glowup draws in the terminal, run in the browser. Pick a pack to recolor them.</p>
      <div className="lab-bar">
        <PackSwitch value={pack} onChange={setPack} />
        <MotionToggle clock={clock} />
      </div>

      <section aria-labelledby="spinners" className="lab-sec">
        <h2 id="spinners" className="section-h">Spinners</h2>
        <div className="lab-grid">
          {(Object.keys(SPINNERS) as SpinnerId[]).map(id => (
            <Card key={id} id={id} title={SPINNERS[id].name} note={NOTES[id]} look={look} now={clock.now} state={id === 'orb-states' ? orbNow : undefined} />
          ))}
        </div>
      </section>

      <section aria-labelledby="orb" className="lab-sec">
        <h2 id="orb" className="section-h">Orb states</h2>
        <p className="section-p">The orb changes with what Claude is doing.</p>
        <div className="lab-grid">
          {ORB.map(s => <Card key={s} id="orb-states" title={s} note={ORB_NOTE[s]} look={look} now={clock.now} state={s} />)}
        </div>
      </section>

      <Clawd look={look} now={clock.now} />
    </div>
  )
}
