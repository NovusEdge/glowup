import { useState } from 'react'
import {
  BORDERS, FIELD_IDS, METER_STYLES, ROW_STYLES, SPINNER_IDS,
  type ColorsLayer, type Look,
} from '../landing/data.ts'
import { ColorsSection } from './ColorsSection'
import { SetupControls } from './SetupControls'
import { editColors, editMotion, type Draft, type Role, type StudioSetup } from './model.ts'

type Props = {
  draft: Draft; look: Look; setup: StudioSetup
  onDraft(d: Draft): void; onSetup(s: StudioSetup): void; onHover(role?: Role): void; onTier(w: 'narrow' | 'wide'): void
}

const SHIMMER = ['off', 'soft', 'strong'] as const
const SECTIONS = ['Colors', 'Rows & meters', 'Motion', 'Setup'] as const

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange(v: T): void }) {
  return (
    <label className="fld">
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value as T)}>{options.map(o => <option key={o}>{o}</option>)}</select>
    </label>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange(v: boolean): void }) {
  return <label className="chk"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /> {label}</label>
}

export function Controls({ draft, look, setup, onDraft, onSetup, onHover, onTier }: Props) {
  const [open, setOpen] = useState<(typeof SECTIONS)[number] | undefined>('Colors')
  const m = draft.motion
  const colors = (patch: Partial<ColorsLayer>) => onDraft(editColors(draft, patch))
  const motion = (patch: Parameters<typeof editMotion>[1]) => onDraft(editMotion(draft, patch))
  const field = typeof m.field === 'object' ? m.field : { shape: look.motion.field.shape }

  const body: Record<(typeof SECTIONS)[number], React.ReactNode> = {
    Colors: <ColorsSection draft={draft} look={look} onDraft={onDraft} onHover={onHover} />,
    'Rows & meters': (
      <>
        <div className="cols3">
          <Select label="Rows" value={look.rows} options={ROW_STYLES} onChange={rows => colors({ rows })} />
          <Select label="Border" value={look.border} options={BORDERS} onChange={border => colors({ border })} />
          <Select label="Meters" value={look.meters} options={METER_STYLES} onChange={meters => colors({ meters })} />
        </div>
        <div className="checks">
          <Check label="Dividers" checked={look.dividers} onChange={dividers => colors({ dividers })} />
          <Check label="HP bar" checked={look.extras.hp} onChange={hp => colors({ extras: { ...look.extras, hp } })} />
          <Check label="Combo" checked={look.extras.combo} onChange={combo => colors({ extras: { ...look.extras, combo } })} />
          {(['labels', 'markers', 'xp'] as const).map(k => (
            <Check key={k} label={`Row ${k}`} checked={look.rowFlags[k]} onChange={v => colors({ rowFlags: { ...look.rowFlags, [k]: v } })} />
          ))}
        </div>
      </>
    ),
    Motion: (
      <>
        <div className="cols3">
          <Select label="Spinner" value={look.motion.spinner} options={SPINNER_IDS} onChange={spinner => motion({ spinner })} />
          <Select label="Field" value={look.motion.field.shape} options={FIELD_IDS} onChange={shape => motion({ field: { ...field, shape } })} />
          <label className="fld">
            <span>Spinner color</span>
            <input type="color" value={m.color ?? look.motion.color} onChange={e => motion({ color: e.target.value })} />
          </label>
        </div>
        <div className="checks" role="radiogroup" aria-label="Shimmer">
          {SHIMMER.map((label, i) => (
            <label key={label} className="chk">
              <input type="radio" name="shimmer" checked={look.motion.shimmer === i} onChange={() => motion({ shimmer: i as 0 | 1 | 2 })} /> shimmer {label}
            </label>
          ))}
        </div>
      </>
    ),
    Setup: <SetupControls setup={setup} onSetup={onSetup} onTier={onTier} />,
  }

  return (
    <div className="acc">
      {SECTIONS.map(s => {
        const id = s.replace(/\W+/g, '-').toLowerCase()
        const on = open === s
        return (
          <section key={s} className="acc-sec">
            <h2>
              <button type="button" id={`acc-${id}`} aria-expanded={on} aria-controls={`acc-${id}-body`} onClick={() => setOpen(on ? undefined : s)}>
                <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
                {s}
              </button>
            </h2>
            <div id={`acc-${id}-body`} role="region" aria-labelledby={`acc-${id}`} hidden={!on} className="acc-body">{body[s]}</div>
          </section>
        )
      })}
    </div>
  )
}
