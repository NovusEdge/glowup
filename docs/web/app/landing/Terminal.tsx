import { useEffect, useRef, useState } from 'react'
import { CLAWD_SAY, spinnerWordSpans, type OrbState } from './data.ts'
import { useReducedMotion, useVisible } from './motion.ts'
import { Pet } from './Pet.tsx'
import { usePack } from './PackContext.tsx'
import { SpinnerCanvas } from './SpinnerCanvas.tsx'
import { finalState, runScript, type FileStat, type Kind, type Row, type TermState } from './script.ts'
import './terminal.css'

const ORB: Record<Kind | 'fail' | 'pass', OrbState> = { read: 'search', agent: 'agents', edit: 'work', shell: 'run', fail: 'think', pass: 'think' }
const GLYPH: Record<Kind, string> = { read: '▸', edit: '✎', shell: '$', agent: '◆' }
const WORD = 'Thinking…'

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

export function Terminal() {
  const { pack, look, hop } = usePack()
  const reduced = useReducedMotion()
  const visible = useVisible()
  const [state, setState] = useState<TermState>(finalState)
  // Line choice is a counter bumped when a bubble opens, never Math.random, so the prerender matches.
  const [bub, setBub] = useState({ kind: 'done' as 'fail' | 'done', n: 0 })
  const prevBubble = useRef<TermState['bubble']>(null)

  useEffect(() => {
    if (reduced || !visible) return
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

  return (
    <div className="term" data-pack={pack} data-rows={look.rows} data-border={look.border} role="img"
      aria-label="A Claude Code session with glowup: Claude edits src/auth.ts, a test fails, the fix passes.">
      <div className="tbar"><i /><i /><i /><span className="ttl">claude — ~/shop</span></div>
      <div className="tbody">
        <div className="tx">{state.rows.map((r, i) => <RowView key={i} r={r} />)}</div>
        <aside className="pane">
          <div className="ptabs"><b>[ Changes ]</b> [ Agents ] [ Plan &amp; context ]</div>
          <div className="phead">CHANGES<span className="tot">{state.files.length ? `${state.files.length} files` : ''}</span></div>
          <div className="plist">
            {state.files.map(f => (
              <div key={f.name} className={`pf k-${f.kind}`}><span className="g">{GLYPH[f.kind]}</span><span className="n">{f.name}</span><span className="s"><Stat f={f} /></span></div>
            ))}
          </div>
          <div className="pcard">
            <span className={`st${state.status.tone === 'work' ? ' wk' : state.status.tone === 'bad' ? ' bad' : ''}`}>{state.status.text}</span>
            <Hearts n={state.hearts} />
            <span className="ag">{agents && state.status.tone === 'work' ? '◆ Explore working' : ''}</span>
            <div className="petbox">
              <Pet scale={3} mode={state.pet} hopKey={hop} />
              <span className={`bub${state.bubble ? ' on' : ''}`} style={{ ['--bubc' as string]: bub.kind === 'fail' ? 'var(--fail)' : 'var(--pass)', color: 'var(--text)' }}>{lines[bub.n % lines.length]}</span>
            </div>
          </div>
        </aside>
      </div>
      <div className={`band${state.bandOn ? '' : ' off'}`}>
        <SpinnerCanvas id={look.motion.spinner} look={look} state={ORB[band?.kind ?? 'pass']} cw={8} ch={17} minRows={2} />
        {showWord ? <Word animate={!reduced && visible} /> : <span className="word" />}
        <span className="sep">·</span>
        <span className={`act k-${band?.kind ?? 'pass'}`}>{band?.text}</span>
        {agents ? <><span className="sep agsep">·</span><span className="ag">◆ {agents} subagent</span></> : null}
        <span className="sep">·</span>
        <Hearts n={state.hearts} />
        <span className="combo">{look.extras.combo && state.combo > 1 ? `COMBO ×${state.combo}` : ''}</span>
      </div>
      <div className="prompt"><span style={{ color: 'var(--accent)' }}>❯</span><span className="c">{state.typed}</span><span className="cur">&nbsp;</span></div>
      <div className="status">
        <span className="gl">glowup: <span className="gs">{gw}</span> · ctx <span className="ctx">{state.ctx}</span>%</span>
        <span className="m">Model: Opus 5.5  ⎇ main  (+0,−0)</span>
      </div>
    </div>
  )
}
