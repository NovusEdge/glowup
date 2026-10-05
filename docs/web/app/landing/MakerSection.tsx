import { MiniTerminal } from './MiniTerminal.tsx'
import { usePack } from './PackContext.tsx'

export function MakerSection() {
  const { look } = usePack()
  return (
    <section className="sec" aria-labelledby="maker-title">
      <h2 id="maker-title">Make your own</h2>
      <p className="lede">Pick every color, the rows, the spinner and your layout in the studio, with a live preview. Then copy one command into Claude Code.</p>
      <div className="maker">
        <MiniTerminal word={look.theme.spinnerWords[0] ?? 'Thinking'} rows={look.rows} />
        <p className="lede small"><a href="/studio">Open the studio →</a></p>
      </div>
    </section>
  )
}
