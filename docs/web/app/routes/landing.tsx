import { useState } from 'react'
import { Link } from 'react-router'
import { PRESETS } from '../../../../hooks/presets.ts'
import { BASE, REPO } from '../site'
import type { Route } from './+types/landing'

export const meta: Route.MetaFunction = () => [
  { title: 'glowup · a glow-up for Claude Code' },
  { name: 'description', content: 'A Claude Code mod that shows what Claude is doing, live, in themes you can write and share.' },
]

const INSTALL = '/plugin marketplace add NovusEdge/glowup\n/plugin install glowup@glowup'

// The screenshots are added after the site, so a missing file leaves the styled placeholder.
function Shot({ file, alt, wide }: { file: string; alt: string; wide?: boolean }) {
  const [ok, setOk] = useState(true)
  return (
    <figure className={`shot ${wide ? 'shot-wide' : ''}`}>
      <span className="shot-ph" aria-hidden="true">{alt}</span>
      {/* A missing file can fail before hydration, so the ref checks for an already failed load. */}
      {ok && <img src={`${BASE}media/${file}`} alt={alt} loading="lazy" onError={() => setOk(false)} ref={el => { if (el?.complete && el.naturalWidth === 0) setOk(false) }} />}
    </figure>
  )
}

function Install() {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(INSTALL).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="codeblock hero-install">
      <div className="codehead">
        <span>claude code</span>
        <button type="button" onClick={copy} aria-label="Copy install commands">{copied ? 'copied' : 'copy'}</button>
      </div>
      <pre><code>{INSTALL}</code></pre>
    </div>
  )
}

const FEATURES = [
  {
    title: 'Pane with three tabs',
    body: 'Changes, Agents, and Plan & context. It docks beside the transcript in fullscreen at 144 columns or more, and opens as a drawer with /glowup pane on narrower terminals.',
    to: '/layout',
  },
  {
    title: 'Activity band',
    body: 'One line above the prompt while Claude works: the current action, running subagents, context as hearts, and plan progress. It folds away 1.5 seconds after the turn ends.',
    to: '/layout',
  },
  {
    title: 'Themes as files',
    body: 'A theme is a JSON file of colors, glyphs and spinner words. Extend a built-in theme, then share the file by URL.',
    to: '/themes',
  },
  {
    title: 'Status line',
    body: 'While Claude works, a glowup entry shows under the prompt and your own status line stays untouched. If you want glowup to draw the whole line, one command does it after you confirm, and one command undoes it.',
    to: '/statusline',
  },
]

const SWATCH_KEYS = ['accent', 'text', 'dim', 'read', 'edit', 'shell', 'agent', 'pass', 'fail'] as const

function Preset({ name }: { name: string }) {
  const p = PRESETS[name]!
  const base = PRESETS.classic!
  const c = { ...base.colors, ...p.colors } as Record<string, string>
  const words = (p.spinner?.words ?? base.spinner!.words!).join(', ')
  return (
    <article className="preset" style={{ background: c.panel, color: c.text, borderColor: c.faint }}>
      <h3 style={{ color: c.accent }}>{name}</h3>
      <p className="preset-line" aria-hidden="true">
        <span style={{ color: c.edit }}>✎ Editing auth.ts</span>
        <span style={{ color: c.dim }}> · </span>
        <span style={{ color: c.agent }}>◆ 2 subagents</span>
        <span style={{ color: c.dim }}> · </span>
        <span style={{ color: c.fail }}>♥♥♥</span>
        <span style={{ color: c.dim }}>♡♡</span>
      </p>
      <ul className="swatches" aria-label={`${name} colors`}>
        {SWATCH_KEYS.map(k => (
          <li key={k} title={`${k} ${c[k]}`} style={{ background: c[k], borderColor: c.faint }}>
            <span className="sr-only">{k} {c[k]}</span>
          </li>
        ))}
      </ul>
      <p className="preset-meta" style={{ color: c.dim }}>Spinner: {words}</p>
    </article>
  )
}

export default function Landing() {
  return (
    <>
      <section className="hero mx-auto max-w-[1100px] px-4 pb-10 pt-14 sm:px-6 sm:pt-20">
        <p className="label mb-4 !text-(--accent)">A Claude Code mod</p>
        <h1>Watch Claude work.</h1>
        <p className="hero-pitch">glowup shows what Claude is doing as it happens, in themes you can write and share.</p>
        <Install />
        <p className="hero-links">
          <Link to="/install">Install guide</Link>
          <Link to="/themes">Make a theme</Link>
          <a href={REPO}>GitHub</a>
        </p>
        <Shot file="hero.gif" alt="glowup in a Claude Code session" wide />
      </section>

      <section className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6" aria-labelledby="features">
        <h2 id="features" className="section-h">What it adds</h2>
        <div className="features">
          {FEATURES.map(f => (
            <article key={f.title} className="feature">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <Link to={f.to}>Read more</Link>
            </article>
          ))}
        </div>
        <div className="shots">
          <Shot file="pane-wide.png" alt="The pane docked beside the transcript" />
          <Shot file="band.png" alt="The band above the prompt" />
          <Shot file="compact.png" alt="The compact drawer" />
        </div>
      </section>

      <section className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6" aria-labelledby="gallery">
        <h2 id="gallery" className="section-h">Built-in themes</h2>
        <p className="section-p">Four themes ship with glowup. <Link to="/theme-reference">The theme reference</Link> lists every value.</p>
        <div className="gallery">
          {Object.keys(PRESETS).map(n => <Preset key={n} name={n} />)}
        </div>
      </section>
    </>
  )
}
