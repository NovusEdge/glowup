import { useEffect, useMemo, useState } from 'react'
import { SPINNERS, type OrbState, type SpinnerId } from './data.ts'
import { PACK_NAMES, packLook } from './look.ts'
import { useReducedMotion } from './motion.ts'
import { usePack } from './PackContext.tsx'
import { SpinnerCanvas } from './SpinnerCanvas.tsx'

const STATES: OrbState[] = ['think', 'search', 'work', 'run', 'agents']
const IDS = (Object.keys(SPINNERS) as SpinnerId[]).filter(id => id !== 'shimmer')

export function SpinnersSection() {
  const { look } = usePack()
  const [small, setSmall] = useState(false)
  const [state, setState] = useState(0)
  const reduced = useReducedMotion()
  const owner = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of PACK_NAMES) { const id = packLook(p).motion.spinner; if (!m.has(id)) m.set(id, p) }
    return m
  }, [])

  useEffect(() => {
    const mq = matchMedia('(max-width: 800px)')
    const on = () => setSmall(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  useEffect(() => {
    if (reduced) return
    const t = setInterval(() => setState(s => (s + 1) % STATES.length), 2200)
    return () => clearInterval(t)
  }, [reduced])

  const st = STATES[state]!
  return (
    <section className="sec" aria-labelledby="spinners-title">
      <h2 id="spinners-title">Spinners</h2>
      <p className="lede">Pick one with <code>/glowup spinner &lt;name&gt;</code>, or let the pack choose.</p>
      <div className="spins">
        {IDS.map(id => {
          const cmd = `/glowup spinner ${id}`
          const pack = owner.get(id)
          return (
            <div className="card spinc" key={id}>
              <div className="art">
                <SpinnerCanvas id={id} look={look} state={id === 'orb-states' ? st : undefined} cw={small ? 12 : 18} ch={small ? 26 : 38} minRows={2} label={cmd} />
              </div>
              <b>{id === 'orb-states' ? `orb-states · ${st}` : id}</b>
              <span className="cmd">{cmd}{pack ? ` · ${pack} pack` : ''}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
