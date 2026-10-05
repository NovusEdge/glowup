import { useEffect, useState } from 'react'
import { BAND_ITEMS, SETUP_MOODS, TAB_IDS, type Setup } from '../landing/data.ts'
import { editSetup, move, toggle } from './model.ts'

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

function Order<T extends string>({ title, all, active, labels, onChange }: { title: string; all: readonly T[]; active: T[]; labels: Record<T, string>; onChange(next: T[]): void }) {
  const items = [...active, ...all.filter(x => !active.includes(x))]
  return (
    <div className="order" role="group" aria-label={title}>
      <h4>{title}</h4>
      {items.map(item => {
        const i = active.indexOf(item)
        return (
          <div key={item} className="orow">
            <label><input type="checkbox" checked={i >= 0} onChange={() => onChange(toggle(active, item))} /> {labels[item]}</label>
            <button type="button" aria-label={`Move ${labels[item].toLowerCase()} up`} disabled={i <= 0} onClick={() => onChange(move(active, i, -1))}>↑</button>
            <button type="button" aria-label={`Move ${labels[item].toLowerCase()} down`} disabled={i < 0 || i === active.length - 1} onClick={() => onChange(move(active, i, 1))}>↓</button>
          </div>
        )
      })}
    </div>
  )
}

const BAND_LABEL = { combo: 'Combo', agents: 'Agents', meter: 'Meter', plan: 'Plan' }
const TAB_LABEL = { changes: 'Changes', agents: 'Agents', plan: 'Plan' }

export function SetupControls({ setup, onSetup, onTier }: { setup: Setup; onSetup(s: Setup): void; onTier(w: 'narrow' | 'wide'): void }) {
  const [notice, setNotice] = useState<string>()
  const apply = (patch: Partial<Setup>) => {
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
      {notice && <p className="bad" role="status">{notice}</p>}
      <Order title="Band" all={BAND_ITEMS} active={setup.band} labels={BAND_LABEL} onChange={band => apply({ band })} />
      <Order title="Tabs" all={TAB_IDS} active={setup.tabs} labels={TAB_LABEL} onChange={tabs => apply({ tabs })} />
      <div className="line">
        <NumField label="Meter warn %" value={setup.meter.warn} min={1} max={99} onCommit={warn => apply({ meter: { ...setup.meter, warn } })} />
        <NumField label="Meter danger %" value={setup.meter.danger} min={1} max={99} onCommit={danger => apply({ meter: { ...setup.meter, danger } })} />
      </div>
      <div className="order" role="group" aria-label="Bubbles">
        <h4>Bubbles</h4>
        <div className="line">
          {SETUP_MOODS.map(m => (
            <label key={m}><input type="checkbox" checked={setup.bubbles.moods.includes(m)} onChange={() => apply({ bubbles: { ...setup.bubbles, moods: toggle(setup.bubbles.moods, m) } })} /> {MOOD_LABEL[m]}</label>
          ))}
        </div>
        <NumField label="Bubble time (s)" value={setup.bubbles.ms / 1000} min={1.5} max={10} step={0.5} onCommit={s => apply({ bubbles: { ...setup.bubbles, ms: Math.round(s * 1000) } })} />
      </div>
      <NumField label="Pet sleeps after (s)" value={setup.pet.sleepMs / 1000} min={15} max={600} onCommit={s => apply({ pet: { sleepMs: Math.round(s * 1000) } })} />
    </>
  )
}
