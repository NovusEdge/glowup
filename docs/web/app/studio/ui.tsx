import { useEffect, useRef, useState } from 'react'
import { normalizeHex } from '../landing/data.ts'
import { ColorWheel } from './ColorWheel'
import { move, toggle } from './model.ts'

export function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange(v: T): void }) {
  return (
    <label className="fld">
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value as T)}>{options.map(o => <option key={o}>{o}</option>)}</select>
    </label>
  )
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange(v: boolean): void }) {
  return <label className="chk"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /> {label}</label>
}

// onCommit returns a message to refuse the text, nothing to accept it. The applied value may be a normalised
// form of what was typed ("a, " becomes "a"), so it only replaces the text while the field is not being typed in.
export function TextField({ label, value, onCommit, className, size, maxLength }: { label: string; value: string; onCommit(text: string): string | undefined; className?: string; size?: number; maxLength?: number }) {
  const [text, setText] = useState(value)
  const [error, setError] = useState<string>()
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (document.activeElement !== input.current) setText(value) }, [value])
  return (
    <label className={className ? `fld ${className}` : 'fld'}>
      <span>{label}</span>
      <input
        ref={input} type="text" value={text} size={size} maxLength={maxLength} spellCheck={false} aria-invalid={!!error}
        onChange={e => { setText(e.target.value); setError(onCommit(e.target.value)) }}
        onBlur={() => { setText(value); setError(undefined) }}
      />
      <span className="st-err" role="status">{error}</span>
    </label>
  )
}

export function HexField({ label, value, onCommit }: { label: string; value: string; onCommit(hex: string): void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <input
      type="text" className="hex" size={8} maxLength={9} spellCheck={false} aria-label={`${label} hex`} value={text}
      onChange={e => {
        setText(e.target.value)
        const hex = normalizeHex(e.target.value.trim())
        if (hex) onCommit(hex)
      }}
    />
  )
}

// A swatch that opens the wheel in place; the native color input would bring the OS picker.
export function ColorPick({ label, value, onChange }: { label: string; value: string; onChange(hex: string): void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="fld cpick">
      <span>{label}</span>
      <button type="button" className="cpick-btn" aria-expanded={open} aria-label={`${label}: ${value}`} onClick={() => setOpen(!open)}>
        <i style={{ background: value }} />{value}
      </button>
      {open && (
        <div className="pick-edit">
          <ColorWheel hex={value} label={label} onChange={onChange} />
          <div className="pick-side"><HexField label={label} value={value} onCommit={onChange} /></div>
        </div>
      )}
    </div>
  )
}

export function Order<T extends string>({ title, all, active, labels, onChange }: { title: string; all: readonly T[]; active: T[]; labels: Record<T, string>; onChange(next: T[]): void }) {
  const items = [...active, ...all.filter(x => !active.includes(x))]
  return (
    <div className="order" role="group" aria-label={title}>
      <h3>{title}</h3>
      {items.map(item => {
        const i = active.indexOf(item)
        return (
          <div key={item} className="orow">
            <label className="chk"><input type="checkbox" checked={i >= 0} onChange={() => onChange(toggle(active, item))} /> {labels[item]}</label>
            <button type="button" aria-label={`Move ${labels[item].toLowerCase()} up`} disabled={i <= 0} onClick={() => onChange(move(active, i, -1))}>↑</button>
            <button type="button" aria-label={`Move ${labels[item].toLowerCase()} down`} disabled={i < 0 || i === active.length - 1} onClick={() => onChange(move(active, i, 1))}>↓</button>
          </div>
        )
      })}
    </div>
  )
}
