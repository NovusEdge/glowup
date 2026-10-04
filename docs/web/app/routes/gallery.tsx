import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { PACKS } from '../../../../hooks/packpresets.ts'
import { COLOR_KEYS } from '../../../../hooks/themes.ts'
import { gradient } from '../../../../hooks/color.ts'
import { MARKS, retroTag } from '../../../../hooks/rows-text.ts'
import type { Border, Look } from '../../../../hooks/packs.ts'
import { MotionToggle, PACK_NAMES, Spans, SpinnerView, Term, lookOf, useClock } from '../lab'
import type { Route } from './+types/gallery'

export const meta: Route.MetaFunction = () => [
  { title: 'Packs gallery · glowup' },
  { name: 'description', content: 'The built-in glowup packs: colors, row style, border and spinner, with the command to switch to each.' },
]

const BORDER: Record<Border, CSSProperties> = {
  round: { borderStyle: 'solid', borderWidth: 1, borderRadius: 10 },
  single: { borderStyle: 'solid', borderWidth: 1, borderRadius: 0 },
  double: { borderStyle: 'double', borderWidth: 4, borderRadius: 0 },
  bold: { borderStyle: 'solid', borderWidth: 3, borderRadius: 0 },
  classic: { borderStyle: 'dashed', borderWidth: 1, borderRadius: 4 },
}

type Row = { tool: string; target: string; tone: 'read' | 'edit' | 'shell'; glyph: string }

// rows.tsx draws labels with a gradient only up to 48 characters.
function Label({ look, text, color, bold }: { look: Look; text: string; color: string; bold?: boolean }) {
  if (look.gradient && [...text].length <= 48) {
    const spans = gradient(text, look.gradient[0], look.gradient[1])
    return <span style={{ whiteSpace: 'pre' }}><Spans spans={bold ? spans.map(s => ({ ...s, bold: true })) : spans} /></span>
  }
  return <span style={{ whiteSpace: 'pre', color, ...(bold ? { fontWeight: 700 } : {}) }}>{text}</span>
}

const cardBox = (look: Look): CSSProperties => ({ ...BORDER[look.border], borderColor: look.theme.colors.faint, padding: '0 8px' })
const sideBar = (color: string): CSSProperties => ({ borderLeft: `2px solid ${color}`, paddingLeft: 8 })

// The same text and structure rows.tsx draws in the terminal. The page cannot import that file, which needs Ink elements.
function Mock({ look }: { look: Look }) {
  const c = look.theme.colors
  const g = look.theme.glyphs
  const user = 'fix the failing test in auth.ts'
  const reply = 'The test failed on a missing await. Fixed it.'
  const rows: Row[] = [
    { tool: 'Read', target: 'src/auth.ts', tone: 'read', glyph: g.read },
    { tool: 'Edit', target: 'src/auth.ts', tone: 'edit', glyph: g.edit },
    { tool: 'Bash', target: 'pnpm test · 12 passed', tone: 'shell', glyph: g.shell },
  ]
  let body: ReactNode
  if (look.rows === 'cards') {
    body = <>
      <div className="mock-row" style={sideBar(c.accent)}><Label look={look} text="you" color={c.accent} /><div>{user}</div></div>
      {rows.map(r => (
        <div key={r.tool} className="mock-row" style={{ ...cardBox(look), display: 'flex', gap: 8 }}>
          <span style={{ flex: 1, color: c.text }}>{r.tool}({r.target})</span>
          <span style={{ color: c.pass }}>{MARKS.cards.done}</span>
        </div>
      ))}
      <div className="mock-row" style={sideBar(c.faint)}><Label look={look} text="claude" color={c.accent} /><div>{reply}</div></div>
    </>
  } else if (look.rows === 'retro') {
    body = <>
      <div className="mock-row"><Label look={look} text="[YOU] " color={c.accent} bold />{user}</div>
      {rows.map(r => (
        <div key={r.tool} className="mock-row" style={{ display: 'flex' }}>
          <Label look={look} text={retroTag(r.tool)} color={c.accent} />
          <span style={{ flex: 1, whiteSpace: 'pre', color: c.text }}>{r.target}</span>
          <span style={{ whiteSpace: 'pre', color: c.pass }}>{' ' + MARKS.retro.done}</span>
        </div>
      ))}
      <div className="mock-row"><Label look={look} text="[CLAUDE]" color={c.accent} bold /></div>
      <div className="mock-row" style={{ paddingLeft: '9ch' }}>{reply}</div>
    </>
  } else if (look.rows === 'minimal') {
    body = <>
      <div className="mock-row"><span style={{ color: c.accent }}>{'› '}</span>{user}</div>
      {rows.map(r => <div key={r.tool} className="mock-row" style={{ color: c.dim }}>{'· ' + r.tool + ' ' + r.target}</div>)}
      <div className="mock-row">{reply}</div>
    </>
  } else {
    body = <>
      <div className="mock-row"><span style={{ color: c.accent }}>❯</span> {user}</div>
      {rows.map(r => (
        <div key={r.tool} className="mock-row">
          <span style={{ color: c.text }}>{r.tool}({r.target})</span><span style={{ whiteSpace: 'pre', color: c[r.tone] }}>{'  ' + r.glyph}</span>
        </div>
      ))}
      <div className="mock-row">{reply}</div>
    </>
  }
  const filled = 8
  const [a, b] = look.gradient ?? [c.accent, c.pass]
  return (
    <div className="mock" style={{ borderStyle: 'solid', borderWidth: 1, borderRadius: 6, borderColor: c.faint, background: look.bg, color: c.text }}>
      <div style={look.rows === 'classic' ? undefined : { paddingLeft: '1ch' }}>{body}</div>
      {look.extras.hp && (
        <div className="mock-row">
          <span style={{ color: c.accent, fontWeight: 700 }}>HP </span>
          <Spans spans={gradient('█'.repeat(filled), c.fail, c.pass)} />
          <span style={{ color: c.faint }}>{'░'.repeat(10 - filled)}</span>
          <span style={{ whiteSpace: 'pre', color: c.dim }}>{'  80% context left'}</span>
        </div>
      )}
      {look.extras.combo && (
        <div className="mock-row"><Spans spans={gradient(' COMBO x3 ', a, b).map(s => ({ ...s, bold: true }))} /></div>
      )}
    </div>
  )
}

function CopyCommand({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="codeblock cmd">
      <pre><code>{text}</code></pre>
      <button type="button" onClick={copy} aria-label={`Copy ${text}`}>{copied ? 'copied' : 'copy'}</button>
      <span className="sr-only" aria-live="polite">{copied ? 'copied' : ''}</span>
    </div>
  )
}

function Panel({ name, now }: { name: string; now: number }) {
  const look = useMemo(() => lookOf(name), [name])
  const c = look.theme.colors
  const pack = PACKS[name]!
  return (
    <article className="pack" aria-labelledby={`pack-${name}`}>
      <header>
        <h2 id={`pack-${name}`}>{name}</h2>
        <p>{pack.description}</p>
      </header>
      <ul className="swatches swatches-14" aria-label={`${name} colors`}>
        {COLOR_KEYS.map(k => (
          <li key={k} title={`${k} ${c[k]}`} style={{ background: c[k] }}><span className="sr-only">{k} {c[k]}</span></li>
        ))}
      </ul>
      <Mock look={look} />
      <Term look={look} className="pack-spin"><SpinnerView look={look} now={now} name={look.motion.spinner} /></Term>
      <p className="pack-meta">Rows: {look.rows} · border: {look.border} · spinner: {look.motion.spinner}</p>
      <CopyCommand text={`/glowup pack ${name}`} />
    </article>
  )
}

export default function Gallery(): ReactNode {
  const clock = useClock()
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6 sm:py-14">
      <p className="label mb-4 !text-(--accent)">Packs</p>
      <h1 className="lab-h1">Packs gallery</h1>
      <p className="hero-pitch">A pack sets colors, row style, border and spinner in one file. These four ship with glowup.</p>
      <div className="lab-bar"><MotionToggle clock={clock} /></div>
      <div className="packs">
        {PACK_NAMES.map(n => <Panel key={n} name={n} now={clock.now} />)}
      </div>
    </div>
  )
}
