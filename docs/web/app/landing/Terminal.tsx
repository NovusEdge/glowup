import { Fragment, useEffect, useRef, useState } from 'react'
import { CLAWD_SAY, DEFAULT_SETUP, renderFields, spinnerWordSpans, toneFor, type BandItem, type Model, type OrbState, type Setup, type StatusFieldId, type TabId } from './data.ts'
import { useReducedMotion, useVisible } from './motion.ts'
import { PaneField } from './PaneField.tsx'
import { Pet } from './Pet.tsx'
import { usePack } from './PackContext.tsx'
import { SpinnerCanvas } from './SpinnerCanvas.tsx'
import { finalState, runScript, type FileStat, type Kind, type Row, type TermState } from './script.ts'
import './terminal.css'

const ORB: Record<Kind | 'fail' | 'pass', OrbState> = { read: 'search', agent: 'agents', edit: 'work', shell: 'run', fail: 'think', pass: 'think' }
const GLYPH: Record<Kind, string> = { read: '▸', edit: '✎', shell: '$', agent: '◆' }
const ACT_GLYPH: Record<Kind | 'fail' | 'pass', string> = { ...GLYPH, fail: '✗', pass: '✓' }
const TAB_LABEL: Record<TabId, string> = { changes: 'Changes', agents: 'Agents', plan: 'Plan & context' }
const WORD = 'Thinking…'
// The mock's clock for reset countdowns: fixed, so the status line is the same on the server and in the browser.
const NOW = Date.UTC(2026, 0, 1)

function Hearts({ n }: { n: number }) {
  return <span className="hearts">{'♥'.repeat(n)}<i>{'♡'.repeat(5 - n)}</i></span>
}

function Stat({ f }: { f: FileStat }) {
  if (f.kind === 'read') return <>read</>
  return <><span className="a">+{f.add}</span> <span className="d">−{f.del}</span></>
}

function RowView({ r }: { r: Row }) {
  switch (r.t) {
    case 'user': return <div className="u">{r.text}</div>
    case 'tool': return (
      <div className={`row k-${r.kind}`}>
        <span className="dot">●</span><span className="g">{GLYPH[r.kind]}</span>
        <span className="verb">{r.verb}</span><span className="tgt">{r.target}</span><span className="meta">{r.meta}</span>
      </div>
    )
    case 'result': return <div className={`res${r.tone ? ` ${r.tone}` : ''}`}>{r.text}</div>
    case 'diff': return <div className="diff">{r.lines.map(([t, s], i) => <div key={i} className={`dl ${t}`}>{t === 'add' ? '+' : '-'} {s}</div>)}</div>
    case 'say': return <div className="say">{r.text}</div>
  }
}

// Server and first client render show the plain word; the animated spans only exist after mount.
function Word({ animate }: { animate: boolean }) {
  const { look } = usePack()
  const [spans, setSpans] = useState<ReturnType<typeof spinnerWordSpans> | null>(null)
  useEffect(() => {
    if (!animate) { setSpans(null); return }
    const wl = { bg: look.bg, gradient: look.gradient, motion: look.motion, theme: look.theme }
    const paint = () => setSpans(spinnerWordSpans(wl, WORD, performance.now()))
    paint()
    const h = setInterval(paint, 60)
    return () => clearInterval(h)
  }, [animate, look])
  if (!spans) return <span className="word" style={{ color: look.theme.colors.accent }}>{WORD}</span>
  return (
    <span className="word">
      {spans.map((s, i) => <span key={i} style={{ color: s.color, background: s.bg, fontWeight: s.bold ? 700 : undefined }}>{s.text}</span>)}
    </span>
  )
}

const glowupWord = (s: TermState) =>
  s.status.tone === 'idle' ? 'idle' : s.status.tone === 'done' ? 'done' : s.status.tone === 'bad' ? 'failed' : s.status.text.replace(/^◇ /, '').split(' ')[0]!.toLowerCase()

type PlanRow = { title: string; at: 'done' | 'active' | 'pending' }
const PLAN = ['Trace the ?next= redirect', 'Reject off-site targets in safeNext()', 'Cover it with a regression test']

// How far the script has got: 0 nothing, 1 reading, 2 auth.ts edited, 3 test edited, 4 passing.
function stage(s: TermState): number {
  const edited = (n: string) => s.files.some(f => f.name === n && f.kind === 'edit')
  return s.status.tone === 'done' ? 4 : edited('test/auth.test.ts') ? 3 : edited('src/auth.ts') ? 2 : s.rows.length ? 1 : 0
}
const planOf = (s: TermState): PlanRow[] =>
  PLAN.map((title, i) => ({ title, at: stage(s) >= i + 2 ? 'done' : stage(s) === i + 1 ? 'active' : 'pending' }))

const PLAN_GLYPH = { done: '✓', active: '◉', pending: '○' } as const

// The status line the mod would print for these fields, from a small stand-in session.
function statusText(s: TermState, fields: readonly StatusFieldId[], meter: Setup['meter'], look: ReturnType<typeof usePack>['look']): string {
  const kind = s.band?.kind ?? 'pass'
  const working = s.status.tone === 'work'
  const plan = planOf(s)
  const m: Model = {
    working, act: { glyph: ACT_GLYPH[kind], label: s.band?.text ?? '', tone: 'text' },
    agents: working && s.band?.agents ? [{ key: 'a', name: 'Explore', task: '', state: 'running', startedAt: NOW }] : [],
    plan: plan.map((p, i) => ({ id: String(i), title: p.title, status: p.at === 'done' ? 'completed' : p.at === 'active' ? 'in_progress' : 'pending' })),
    files: s.files.filter(f => f.kind === 'edit').map(f => ({ path: f.name, add: f.add ?? 0, del: f.del ?? 0, how: 'edit', at: NOW })),
    ctxPercent: s.ctx, ctxHistory: [], ctxPeak: s.ctx, compactions: 0, actAt: NOW, combo: s.combo,
    limits: [
      { kind: 'five_hour', percentUsed: 38, resetsAt: new Date(NOW + 133 * 60_000).toISOString() },
      { kind: 'seven_day', percentUsed: 12, resetsAt: new Date(NOW + 3 * 86_400_000).toISOString() },
    ],
    costUsd: 0.42, modelName: 'claude-opus-5-5', effort: 'high', root: '/home/me/shop', branch: 'main',
  }
  return renderFields(m, look.theme, fields, { now: NOW, tzOffset: 0, color: 'plain', meter })
}

function AgentsView({ s }: { s: TermState }) {
  const spawned = s.rows.some(r => r.t === 'tool' && r.kind === 'agent')
  const running = spawned && s.status.tone === 'work' && !!s.band?.agents
  const rows = [
    { name: 'Explore', task: 'find other redirect callers', at: !spawned ? 'queued' : running ? 'running' : 'done', tokens: spawned ? '4.2k' : '0' },
    { name: 'Review', task: 'check test coverage', at: 'done', tokens: '12.8k' },
  ]
  return (
    <>
      <div className="phead">AGENTS<span className="tot">{running ? '1 running' : ''}</span></div>
      <div className="plist">
        {rows.map(r => (
          <div key={r.name} className="pf k-agent"><span className="g">◆</span><span className="n">{r.name}<i> {r.task}</i></span><span className="s">{r.at} · {r.tokens}</span></div>
        ))}
      </div>
    </>
  )
}

function PlanView({ s, meter }: { s: TermState; meter: Setup['meter'] }) {
  const plan = planOf(s)
  return (
    <>
      <div className="phead">PLAN<span className="tot">{plan.filter(p => p.at === 'done').length}/{plan.length}</span></div>
      <div className="plist">
        {plan.map(p => <div key={p.title} className={`pf pl-${p.at}`}><span className="g">{PLAN_GLYPH[p.at]}</span><span className="n">{p.title}</span></div>)}
      </div>
      <div className="phead">CONTEXT<span className="tot">{s.ctx}%</span></div>
      <div className="ctxbar" role="img" aria-label={`Context ${s.ctx}% used`}><i style={{ transform: `scaleX(${s.ctx / 100})`, background: `var(--${toneFor(s.ctx, meter)})` }} /></div>
    </>
  )
}

export function Terminal({ setup = DEFAULT_SETUP, interactive = false, scale = 1 }: { setup?: Setup & { statusline?: readonly StatusFieldId[] }; interactive?: boolean; scale?: number } = {}) {
  const { pack, look, hop } = usePack()
  const reduced = useReducedMotion()
  const visible = useVisible()
  const [state, setState] = useState<TermState>(finalState)
  const [tab, setTab] = useState<TabId>('changes')
  // Line choice is a counter bumped when a bubble opens, never Math.random, so the prerender matches.
  const [bub, setBub] = useState({ kind: 'done' as 'fail' | 'done', n: 0 })
  const prevBubble = useRef<TermState['bubble']>(null)

  useEffect(() => {
    // `reduced` is still false on the first pass; reading the query here keeps runScript's empty first frame from flashing.
    if (reduced || matchMedia('(prefers-reduced-motion: reduce)').matches) { setState(finalState()); return }
    if (!visible) return
    const r = runScript(s => {
      if (s.bubble && s.bubble !== prevBubble.current) setBub(b => ({ kind: s.bubble!, n: b.n + 1 }))
      prevBubble.current = s.bubble
      setState(s)
    })
    return () => r.stop()
  }, [reduced, visible])

  const { band } = state
  const lines = CLAWD_SAY[bub.kind]
  const agents = band?.agents ?? 0
  const showWord = state.bandOn && band !== null && band.kind !== 'pass'
  const gw = glowupWord(state)
  // The body shows the selected tab; a tab the setup dropped falls back to Changes, or to the first one left.
  const active: TabId = setup.tabs.includes(tab) ? tab : setup.tabs.includes('changes') ? 'changes' : setup.tabs[0] ?? 'changes'
  const field = look.motion.field

  // role="img": screen readers get one label instead of a looping transcript; crawlers still read the DOM text.
  // The studio's tabs are buttons, and an img role would hide them from the accessibility tree.
  return (
    <div className="term" data-pack={pack} data-rows={look.rows} data-border={look.border} role={interactive ? 'group' : 'img'}
      aria-label="A Claude Code session with glowup: Claude edits src/auth.ts, a test fails, the fix passes.">
      <div className="tbar"><i /><i /><i /><span className="ttl">claude — ~/shop</span></div>
      <div className="tbody">
        <div className="tx">{state.rows.map((r, i) => <RowView key={i} r={r} />)}</div>
        <aside className="pane">
          {/* Landing: the body always lists changes, so that tab is drawn selected; with it hidden, the first tab is. */}
          <div className="ptabs" role={interactive ? 'tablist' : undefined}>{setup.tabs.map((t, i) => {
            const on = interactive ? t === active : setup.tabs.includes('changes') ? t === 'changes' : i === 0
            const label = `[${TAB_LABEL[t]}]`
            if (interactive) return <button key={t} type="button" role="tab" aria-selected={on} className={on ? 'on' : undefined} onClick={() => setTab(t)}>{label}</button>
            return on ? <b key={t}>{label}</b> : <span key={t}>{label}</span>
          })}</div>
          <div className="pbody">
            {interactive && field.shape !== 'none' && <PaneField field={field} colors={look.theme.colors} />}
            {!interactive || active === 'changes' ? (
              <>
                <div className="phead">CHANGES<span className="tot">{state.files.length ? `${state.files.length} files` : ''}</span></div>
                <div className="plist">
                  {state.files.map(f => (
                    <div key={f.name} className={`pf k-${f.kind}`}><span className="g">{GLYPH[f.kind]}</span><span className="n">{f.name}</span><span className="s"><Stat f={f} /></span></div>
                  ))}
                </div>
              </>
            ) : active === 'agents' ? <AgentsView s={state} /> : <PlanView s={state} meter={setup.meter} />}
          </div>
          <div className="pcard">
            <span className={`st${state.status.tone === 'work' ? ' wk' : state.status.tone === 'bad' ? ' bad' : ''}`}>{state.status.text}</span>
            <Hearts n={state.hearts} />
            <span className="ag">{agents && state.status.tone === 'work' ? '◆ Explore working' : ''}</span>
            <div className="petbox">
              <Pet scale={Math.max(3, Math.floor(3 * scale))} mode={state.pet} hopKey={hop} palette={look.pet} />
              <span className={`bub${state.bubble ? ' on' : ''}`} style={{ ['--bubc' as string]: bub.kind === 'fail' ? 'var(--fail)' : 'var(--pass)', color: 'var(--text)' }}>{lines[bub.n % lines.length]}</span>
            </div>
          </div>
        </aside>
      </div>
      <div className={`band${state.bandOn ? '' : ' off'}`}>
        <div className="spin">
          <SpinnerCanvas id={look.motion.spinner} look={look} state={ORB[band?.kind ?? 'pass']} cw={8 * scale} ch={17 * scale} minRows={2} />
          {showWord ? <Word animate={!reduced && visible} /> : <span className="word" />}
          <span className="sep">·</span>
          <span className={`act k-${band?.kind ?? 'pass'}`}>{band?.text}</span>
        </div>
        <div className="bitems">
          {setup.band.map((id: BandItem) => <Fragment key={id}>{
            id === 'agents' ? (agents ? <><span className="sep agsep">·</span><span className="ag">◆ {agents} subagent</span></> : null)
            : id === 'meter' ? <><span className="sep">·</span><Hearts n={state.hearts} /></>
            : id === 'combo' ? <span className="combo">{look.extras.combo && state.combo > 1 ? `COMBO ×${state.combo}` : ''}</span>
            : null
          }</Fragment>)}
        </div>
      </div>
      <div className="prompt"><span style={{ color: 'var(--accent)' }}>❯</span><span className="c">{state.typed}</span><span className="cur">&nbsp;</span></div>
      {interactive && setup.statusline ? (
        <div className="status real"><span className="gl">{statusText(state, setup.statusline, setup.meter, look)}</span></div>
      ) : (
        <div className="status">
          <span className="gl">glowup: <span className="gs">{gw}</span> · ctx <span className="ctx" style={{ color: `var(--${toneFor(state.ctx, setup.meter)})` }}>{state.ctx}</span>%</span>
          <span className="m">Model: Opus 5.5  ⎇ main  (+0,−0)</span>
        </div>
      )}
    </div>
  )
}
