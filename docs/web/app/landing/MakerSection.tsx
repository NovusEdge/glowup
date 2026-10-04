import { useRef, useState } from 'react'
import { COLOR_KEYS, type Theme } from './data.ts'
import { MAKER_START, makerResult } from './maker.ts'
import { MiniTerminal } from './MiniTerminal.tsx'
import { usePack } from './PackContext.tsx'

export function MakerSection() {
  const { look } = usePack()
  const [text, setText] = useState(MAKER_START)
  const good = useRef<Theme | null>(null)

  const r = makerResult(text)
  if (!r.error) good.current = r.theme
  const theme = good.current ?? r.theme

  const vars: Record<string, string> = { '--bg': look.bg }
  for (const k of COLOR_KEYS) vars[`--${k}`] = theme.colors[k]

  return (
    <section className="sec" aria-labelledby="maker-title">
      <h2 id="maker-title">Make your own</h2>
      <p className="lede">A theme is a JSON file. Edit this one and the preview follows.</p>
      <div className="maker">
        <div className="ed">
          <div className="edh" id="maker-file">~/.claude/glowup/themes/sunset.json</div>
          <textarea
            spellCheck={false}
            aria-labelledby="maker-file"
            aria-describedby="maker-err"
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div className="err" id="maker-err" role="status">{r.error}</div>
        </div>
        <MiniTerminal word={theme.spinnerWords[0] ?? 'Thinking'} rows="cards" style={vars as React.CSSProperties} />
      </div>
      <p className="lede small">Then run <code>/glowup theme sunset</code>. Share the file and anyone can use it.</p>
    </section>
  )
}
