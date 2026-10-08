import { useState } from 'react'
import { CLAWD_SHEET } from './data.ts'
import { Pet } from './Pet.tsx'
import { Segmented } from '../ui/Segmented'

const MOODS: [string, string][] = [
  ['working', 'Claude is working'],
  ['fail', 'a test fails'],
  ['done', 'the turn ends green'],
  ['alert', 'Claude needs you'],
  ['juggle', 'three subagents at once'],
  ['scrunch', 'the context is compacted'],
  ['pant', 'the context is 80% full'],
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
        <Segmented labelledBy="outfit-label" value={outfit} options={OUTFITS} onChange={setOutfit} />
        <label><input type="checkbox" checked={shiny} onChange={e => setShiny(e.target.checked)} /> shiny</label>
      </div>
    </section>
  )
}
