import { useEffect, useState } from 'react'
import {
  BORDERS, COLOR_KEYS, FIELD_IDS, METER_STYLES, ROLE_LABELS, ROW_STYLES, SPINNER_IDS,
  type ColorsLayer, type Setup,
} from '../landing/data.ts'
import { PACK_NAMES } from '../landing/look.ts'
import { SetupControls } from './SetupControls'
import { contrast, draftLook, draftProblems, editColors, editMotion, setRole, type Draft, type Role } from './model.ts'

type Props = {
  draft: Draft; setup: Setup
  onDraft(d: Draft): void; onSetup(s: Setup): void; onStart(pack: string): void; onHover(role?: Role): void
}

const SHIMMER = ['off', 'soft', 'strong'] as const

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

function Pick({ label, value, onChange }: { label: string; value: string; onChange(hex: string): void }) {
  return <label className="fld"><span>{label}</span><input type="color" value={value} onChange={e => onChange(e.target.value)} /></label>
}

function RoleRow({ role, value, draft, onDraft, onHover }: { role: Role; value: string; draft: Draft; onDraft(d: Draft): void; onHover(role?: Role): void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <div className="role" onMouseEnter={() => onHover(role)} onMouseLeave={() => onHover()} onFocus={() => onHover(role)} onBlur={() => onHover()}>
      <input type="color" aria-label={`${role} color`} value={value} onChange={e => onDraft(setRole(draft, role, e.target.value) ?? draft)} />
      <input type="text" className="hex" size={8} maxLength={9} spellCheck={false} aria-label={`${role} hex`} value={text} onChange={e => {
        setText(e.target.value)
        const next = setRole(draft, role, e.target.value)
        if (next) onDraft(next)
      }} />
      <b>{role}</b>
      <span>{ROLE_LABELS[role]}</span>
    </div>
  )
}

export function Controls({ draft, setup, onDraft, onSetup, onStart, onHover }: Props) {
  const [start, setStart] = useState('classic')
  const { look } = draftLook(draft)
  const c = draft.colors as ColorsLayer
  const m = draft.motion
  const problem = draftProblems(draft)[0]
  const ratio = contrast(look.theme.colors.text, look.bg)
  const colors = (patch: Partial<ColorsLayer>) => onDraft(editColors(draft, patch))
  const motion = (patch: Parameters<typeof editMotion>[1]) => onDraft(editMotion(draft, patch))
  const field = typeof m.field === 'object' ? m.field : { shape: look.motion.field.shape }

  return (
    <>
      <section className="grp">
        <label className="fld wide">
          <span>Name</span>
          <input type="text" value={draft.name} spellCheck={false} onChange={e => onDraft({ ...draft, name: e.target.value })} />
        </label>
        <p className="bad" role="status">{problem}</p>
        <Select label="Start from" value={start} options={PACK_NAMES} onChange={p => { setStart(p); onStart(p) }} />
      </section>

      <section className="grp">
        <h3>Colors</h3>
        {COLOR_KEYS.map(role => (
          <RoleRow key={role} role={role} value={c.palette?.[role] ?? look.theme.colors[role]} draft={draft} onDraft={onDraft} onHover={onHover} />
        ))}
        <div className="line">
          <Pick label="Background" value={c.bg ?? look.bg} onChange={bg => colors({ bg })} />
          <Pick label="Border color" value={c.borderColor ?? look.borderColor} onChange={borderColor => colors({ borderColor })} />
        </div>
        <Check label="Gradient" checked={!!c.gradient} onChange={on => colors({ gradient: on ? [look.theme.colors.accent, look.theme.colors.read] : undefined })} />
        {c.gradient && (
          <div className="line">
            <Pick label="Gradient start" value={c.gradient[0]} onChange={h => colors({ gradient: [h, c.gradient![1]] })} />
            <Pick label="Gradient end" value={c.gradient[1]} onChange={h => colors({ gradient: [c.gradient![0], h] })} />
          </div>
        )}
        {ratio < 4.5 && <p className="warn">Text on background is {ratio.toFixed(1)}:1; under 4.5:1 is hard to read.</p>}
      </section>

      <section className="grp">
        <h3>Rows and meters</h3>
        <div className="line">
          <Select label="Rows" value={look.rows} options={ROW_STYLES} onChange={rows => colors({ rows })} />
          <Select label="Border" value={look.border} options={BORDERS} onChange={border => colors({ border })} />
          <Select label="Meters" value={look.meters} options={METER_STYLES} onChange={meters => colors({ meters })} />
        </div>
        <div className="line">
          <Check label="Dividers" checked={look.dividers} onChange={dividers => colors({ dividers })} />
          <Check label="HP bar" checked={look.extras.hp} onChange={hp => colors({ extras: { ...look.extras, hp } })} />
          <Check label="Combo" checked={look.extras.combo} onChange={combo => colors({ extras: { ...look.extras, combo } })} />
        </div>
        <div className="line">
          {(['labels', 'markers', 'xp'] as const).map(k => (
            <Check key={k} label={`Row ${k}`} checked={look.rowFlags[k]} onChange={v => colors({ rowFlags: { ...look.rowFlags, [k]: v } })} />
          ))}
        </div>
      </section>

      <section className="grp">
        <h3>Motion</h3>
        <div className="line">
          <Select label="Spinner" value={look.motion.spinner} options={SPINNER_IDS} onChange={spinner => motion({ spinner })} />
          <Select label="Field" value={look.motion.field.shape} options={FIELD_IDS} onChange={shape => motion({ field: { ...field, shape } })} />
          <Pick label="Spinner color" value={m.color ?? look.motion.color} onChange={color => motion({ color })} />
        </div>
        <div className="line" role="radiogroup" aria-label="Shimmer">
          {SHIMMER.map((label, i) => (
            <label key={label} className="chk">
              <input type="radio" name="shimmer" checked={look.motion.shimmer === i} onChange={() => motion({ shimmer: i as 0 | 1 | 2 })} /> {label}
            </label>
          ))}
        </div>
      </section>

      <SetupControls setup={setup} onSetup={onSetup} />
    </>
  )
}
