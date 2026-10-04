import { useEffect, useRef, useState } from 'react'
import { Pet } from './Pet.tsx'
import { PACK_NAMES } from './look.ts'
import { usePack } from './PackContext.tsx'

const INSTALL = '/plugin marketplace add NovusEdge/glowup\n/plugin install glowup@glowup'

export function Hero() {
  const { pack, setPack, hop } = usePack()
  const [pokes, setPokes] = useState(0)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = () => {
    navigator.clipboard?.writeText(INSTALL).then(() => {
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    }, () => {})
  }

  return (
    <section className="hero" aria-labelledby="hero-title">
      <Pet scale={7} mode={{ kind: 'pose', pose: 'idle' }} hopKey={hop + pokes} onClick={() => setPokes(n => n + 1)} className="hero-pet" />
      <h1 id="hero-title">Give Claude a <span>glowup.</span></h1>
      <p className="sub">A mod that makes Claude Code look nicer. Themes, packs, spinners, and a pet named Clawd.</p>
      <div className="row2">
        <div className="install">
          <code>/plugin marketplace add NovusEdge/glowup<br />/plugin install glowup@glowup</code>
          <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>
      <div className="seg" role="group" aria-label="Pack">
        {PACK_NAMES.map(n => (
          <button key={n} type="button" aria-pressed={n === pack} onClick={() => setPack(n)}>{n}</button>
        ))}
      </div>
    </section>
  )
}
