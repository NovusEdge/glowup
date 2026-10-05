import { useEffect, useState } from 'react'
import { BAND_ITEMS, SETUP_MOODS, TAB_IDS } from '../landing/data.ts'
import { editSetup, toggle, type StudioSetup } from './model.ts'
import { Order } from './ui'

const MOOD_LABEL: Record<string, string> = { 'needs-you': 'needs you', fail: 'failed test', done: 'turn done' }

// Keeps what the user typed until it parses, so "6" on the way to "60" is not snapped back by a rejected edit.
function NumField({ label, value, min, max, step = 1, onCommit }: { label: string; value: number; min?: number; max?: number; step?: number; onCommit(n: number): void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
    <label className="fld">
      <span>{label}</span>
      <input type="number" inputMode="decimal" value={text} min={min} max={max} step={step} onChange={e => {
        setText(e.target.value)
        const n = e.target.valueAsNumber
        if (Number.isFinite(n)) onCommit(n)
      }} />
    </label>
  )
}

const BAND_LABEL = { combo: 'Combo', agents: 'Agents', meter: 'Meter', plan: 'Plan' }
const TAB_LABEL = { changes: 'Changes', agents: 'Agents', plan: 'Plan' }

export function SetupControls({ setup, onSetup, onTier }: { setup: StudioSetup; onSetup(s: StudioSetup): void; onTier(w: 'narrow' | 'wide'): void }) {
  const [notice, setNotice] = useState<string>()
  const apply = (patch: Partial<StudioSetup>) => {
    const r = editSetup(setup, patch)
    setNotice(r.notice)
    if (r.notice) return
    onSetup(r.setup)
    // The band only draws in the narrow preview and tabs only in the wide one; show what was just edited.
    if (patch.band) onTier('narrow')
    else if (patch.tabs) onTier('wide')
  }
  return (
    <>
      <p className="st-err" role="status">{notice}</p>
      <Order title="Band" all={BAND_ITEMS} active={setup.band} labels={BAND_LABEL} onChange={band => apply({ band })} />
      <Order title="Tabs" all={TAB_IDS} active={setup.tabs} labels={TAB_LABEL} onChange={tabs => apply({ tabs })} />
      <div className="line">
        <NumField label="Meter warn %" value={setup.meter.warn} min={1} max={99} onCommit={warn => apply({ meter: { ...setup.meter, warn } })} />
        <NumField label="Meter danger %" value={setup.meter.danger} min={1} max={99} onCommit={danger => apply({ meter: { ...setup.meter, danger } })} />
      </div>
      <div className="order" role="group" aria-label="Bubbles">
        <h3>Bubbles</h3>
        <div className="checks">
          {SETUP_MOODS.map(m => (
            <label key={m} className="chk"><input type="checkbox" checked={setup.bubbles.moods.includes(m)} onChange={() => apply({ bubbles: { ...setup.bubbles, moods: toggle(setup.bubbles.moods, m) } })} /> {MOOD_LABEL[m]}</label>
          ))}
        </div>
        <NumField label="Bubble time (s)" value={setup.bubbles.ms / 1000} min={1.5} max={10} step={0.5} onCommit={s => apply({ bubbles: { ...setup.bubbles, ms: Math.round(s * 1000) } })} />
      </div>
      <NumField label="Pet sleeps after (s)" value={setup.pet.sleepMs / 1000} min={15} max={600} onCommit={s => apply({ pet: { sleepMs: Math.round(s * 1000) } })} />
    </>
  )
}
