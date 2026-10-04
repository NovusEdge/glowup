import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { PACKS } from '../../../../hooks/packpresets.ts'
import { COLOR_KEYS } from '../../../../hooks/themes.ts'
import { gradient } from '../../../../hooks/color.ts'
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

type Row = { tone: 'read' | 'edit' | 'shell' | 'pass'; glyph: string; verb: string; target: string }

// A row is drawn by its style the way the mod's rows.tsx draws it in the terminal.
function ToolRow({ look, row }: { look: Look; row: Row }) {
  const c = look.theme.colors
  const tone = c[row.tone]
  if (look.rows === 'cards') {
    return (
      <div className="mock-row" style={{ background: c.panel, borderLeft: `3px solid ${tone}`, borderRadius: 4, padding: '2px 8px' }}>
        <span style={{ color: tone }}>{row.glyph} {row.verb}</span> <span style={{ color: c.dim }}>{row.target}</span>
      </div>
    )
  }
  if (look.rows === 'retro') {
    return (
      <div className="mock-row">
        <span style={{ color: tone }}>[{row.verb.toUpperCase()}]</span> <span style={{ color: c.text }}>{row.target}</span>
      </div>
    )
  }
  if (look.rows === 'minimal') {
    return <div className="mock-row" style={{ color: c.dim }}>{row.verb} {row.target}</div>
  }
  return (
    <div className="mock-row">
      <span style={{ color: tone }}>{row.glyph}</span> <span style={{ color: c.text }}>{row.verb}</span> <span style={{ color: c.dim }}>{row.target}</span>
    </div>
  )
}

function Mock({ look }: { look: Look }) {
  const c = look.theme.colors
  const g = look.theme.glyphs
  const reply = 'The test failed on a missing await. Fixed it.'
  const rows: Row[] = [
    { tone: 'read', glyph: g.read, verb: 'Read', target: 'src/auth.ts' },
    { tone: 'edit', glyph: g.edit, verb: 'Edit', target: 'src/auth.ts' },
    { tone: 'pass', glyph: g.shell, verb: 'Ran', target: 'pnpm test · 12 passed' },
  ]
  return (
    <div className="mock" style={{ ...BORDER[look.border], borderColor: look.borderColor, background: look.bg, color: c.text }}>
      <div className="mock-row"><span style={{ color: c.accent }}>❯</span> fix the failing test in auth.ts</div>
      {rows.map(r => <ToolRow key={r.verb} look={look} row={r} />)}
      <div className="mock-row mock-reply">
        {look.gradient ? <Spans spans={gradient(reply, look.gradient[0], look.gradient[1])} /> : reply}
      </div>
      {look.extras.hp || look.extras.combo ? (
        <div className="mock-row" style={{ color: c.dim }}>
          {look.extras.hp && <span style={{ color: c.fail }}>HP ♥♥♥<span style={{ color: c.dim }}>♡</span></span>}
          {look.extras.hp && look.extras.combo && ' · '}
          {look.extras.combo && <span style={{ color: c.edit }}>combo x3</span>}
        </div>
      ) : null}
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
