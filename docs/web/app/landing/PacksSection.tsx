import { PRESETS } from './data.ts'
import { PACK_NAMES, THEME_NAMES, lookVars, packLook } from './look.ts'
import { MiniTerminal } from './MiniTerminal.tsx'
import { usePack } from './PackContext.tsx'

const SWATCH = ['accent', 'read', 'edit', 'shell', 'agent'] as const

export function PacksSection() {
  const { pack, theme, setPack, setTheme } = usePack()
  return (
    <section className="sec" aria-labelledby="packs-title">
      <h2 id="packs-title">Packs and themes</h2>
      <p className="lede">A pack sets colors, row style, borders and spinner. A theme only swaps the colors. Click one to try it on this page.</p>
      <div className="packs">
        {PACK_NAMES.map(n => {
          const look = packLook(n)
          return (
            <button type="button" className="card packc" key={n} aria-pressed={n === pack && !theme} onClick={() => setPack(n)}>
              <MiniTerminal word={look.theme.spinnerWords[0] ?? 'Thinking'} rows={look.rows} style={lookVars(look) as React.CSSProperties} />
              <span className="cap"><b>{n}</b><span>/glowup pack {n}</span></span>
            </button>
          )
        })}
      </div>
      <div className="themes">
        {THEME_NAMES.map(n => (
          <button type="button" key={n} aria-pressed={n === theme} onClick={() => setTheme(n)}>
            <i aria-hidden="true">{SWATCH.map(k => <u key={k} style={{ background: PRESETS[n]?.colors?.[k] ?? 'transparent' }} />)}</i>
            {n}
          </button>
        ))}
      </div>
    </section>
  )
}
