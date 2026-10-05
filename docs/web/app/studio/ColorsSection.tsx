import { useEffect, useState } from 'react'
import { COLOR_KEYS, ROLE_LABELS, normalizeHex, type ColorsLayer, type Look } from '../landing/data.ts'
import { ColorWheel } from './ColorWheel'
import { contrast, editColors, setRole, type Draft, type Role } from './model.ts'

type Sel = Role | 'bg' | 'borderColor' | 'gradStart' | 'gradEnd'

const EXTRA: Record<Exclude<Sel, Role>, string> = { bg: 'Background', borderColor: 'Border color', gradStart: 'Gradient start', gradEnd: 'Gradient end' }

function HexField({ label, value, onCommit }: { label: string; value: string; onCommit(hex: string): void }) {
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

export function ColorsSection({ draft, look, onDraft, onHover }: { draft: Draft; look: Look; onDraft(d: Draft): void; onHover(role?: Role): void }) {
  const c = draft.colors as ColorsLayer
  const [picked, setPicked] = useState<Sel>('accent')
  const [held, setHeld] = useState(false)
  const gradient = c.gradient
  const sel = !gradient && (picked === 'gradStart' || picked === 'gradEnd') ? 'accent' : picked
  const isRole = (s: Sel): s is Role => (COLOR_KEYS as readonly string[]).includes(s)

  const value: Record<Sel, string> = {
    ...look.theme.colors,
    bg: c.bg ?? look.bg, borderColor: c.borderColor ?? look.borderColor,
    gradStart: gradient?.[0] ?? '#000000', gradEnd: gradient?.[1] ?? '#000000',
  }
  const apply = (s: Sel, hex: string) => {
    if (isRole(s)) onDraft(setRole(draft, s, hex) ?? draft)
    else if (s === 'bg') onDraft(editColors(draft, { bg: hex }))
    else if (s === 'borderColor') onDraft(editColors(draft, { borderColor: hex }))
    else if (gradient) onDraft(editColors(draft, { gradient: s === 'gradStart' ? [hex, gradient[1]] : [gradient[0], hex] }))
  }

  const name = isRole(sel) ? sel : EXTRA[sel]
  const swatches: Sel[] = [...COLOR_KEYS, 'bg', 'borderColor', ...(gradient ? (['gradStart', 'gradEnd'] as const) : [])]
  const ratio = contrast(value[sel], look.bg)
  const textRatio = contrast(look.theme.colors.text, look.bg)
  const lit = (s: Sel) => (isRole(s) ? onHover(s) : onHover())

  return (
    <div className="colors">
      <div className="swatches" role="group" aria-label="Colors">
        {swatches.map(s => (
          <button
            key={s} type="button" className="sw" aria-pressed={sel === s}
            aria-label={isRole(s) ? `${s}: ${ROLE_LABELS[s]}` : EXTRA[s]} title={isRole(s) ? `${s}: ${ROLE_LABELS[s]}` : EXTRA[s]}
            style={{ background: value[s] }}
            onClick={() => setPicked(s)}
            onMouseEnter={() => lit(s)} onMouseLeave={() => onHover()} onFocus={() => lit(s)} onBlur={() => onHover()}
          />
        ))}
      </div>
      <label className="chk">
        <input type="checkbox" checked={!!gradient} onChange={e => onDraft(editColors(draft, { gradient: e.target.checked ? [look.theme.colors.accent, look.theme.colors.read] : undefined }))} /> Gradient
      </label>
      <div className="pick">
        <p className="pick-name"><b>{name}</b>{isRole(sel) && <span>{ROLE_LABELS[sel]}</span>}</p>
        <div
          className="pick-edit"
          onPointerDown={() => { setHeld(true); lit(sel) }}
          onPointerUp={() => { setHeld(false); onHover() }} onPointerCancel={() => { setHeld(false); onHover() }}
          onFocus={() => lit(sel)} onBlur={() => { if (!held) onHover() }}
        >
          <ColorWheel hex={value[sel]} label={name} onChange={hex => apply(sel, hex)} />
          <div className="pick-side">
            <HexField label={name} value={value[sel]} onCommit={hex => apply(sel, hex)} />
            {sel !== 'bg' && <p className="ratio">{ratio.toFixed(1)}:1 on background</p>}
          </div>
        </div>
      </div>
      {textRatio < 4.5 && <p className="warn">Text on background is {textRatio.toFixed(1)}:1; under 4.5:1 is hard to read.</p>}
    </div>
  )
}
