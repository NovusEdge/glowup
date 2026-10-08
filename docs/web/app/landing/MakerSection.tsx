import { ArrowRightIcon } from '../ui/icons'
import { MiniTerminal } from './MiniTerminal.tsx'
import { usePack } from './PackContext.tsx'

export function MakerSection() {
  const { look } = usePack()
  return (
    <section className="sec" aria-labelledby="maker-title">
      <div className="maker">
        <div className="maker-cta">
          <h2 id="maker-title">Make your own</h2>
          <p className="lede">Pick every color, the rows, the spinner and your layout in the studio, with a live preview. Then copy one command into Claude Code.</p>
          <a className="btn btn-primary" href="/studio">Open the studio<ArrowRightIcon /></a>
        </div>
        <MiniTerminal word={look.theme.spinnerWords[0] ?? 'Thinking'} rows={look.rows} />
      </div>
    </section>
  )
}
