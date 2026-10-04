import { useState } from 'react'
import { CLAWD_SHEET } from './data.ts'
import { Pet } from './Pet.tsx'

const MOODS: [string, string][] = [
  ['working', 'Claude is working'],
  ['fail', 'a test fails'],
  ['done', 'the turn ends green'],
  ['alert', 'Claude needs you'],
  ['sleep', 'nothing for a minute'],
  ['hop', 'you click him'],
]
const OUTFITS = ['none', ...Object.keys(CLAWD_SHEET.outfits ?? {})]

export function ClawdSection() {
  const [outfit, setOutfit] = useState('none')
  const [shiny, setShiny] = useState(false)
  return (
    <section className="sec" aria-labelledby="clawd-title">
      <h2 id="clawd-title">Clawd</h2>
      <p className="lede">He lives in the pane and reacts to the session.</p>
      <div className="moods">
        {MOODS.map(([pose, when]) => (
          <div className="card mood" key={pose}>
            <Pet scale={5} mode={{ kind: 'pose', pose }} outfit={outfit === 'none' ? undefined : outfit} shiny={shiny} />
            <b>{pose}</b>
            <span>{when}</span>
          </div>
        ))}
      </div>
      <div className="dress">
        <span id="outfit-label">Outfit</span>
        <div className="seg2" role="group" aria-labelledby="outfit-label">
          {OUTFITS.map(o => (
            <button key={o} type="button" aria-pressed={o === outfit} onClick={() => setOutfit(o)}>{o}</button>
          ))}
        </div>
        <label><input type="checkbox" checked={shiny} onChange={e => setShiny(e.target.checked)} /> shiny</label>
      </div>
    </section>
  )
}
