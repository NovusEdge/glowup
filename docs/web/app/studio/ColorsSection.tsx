import { useState } from 'react'
import { CLAWD_SHEET, COLOR_KEYS, ROLE_LABELS, type ColorsLayer, type Look } from '../landing/data.ts'
import { mixHex } from '../landing/look.ts'
import { Pet } from '../landing/Pet'
import { ColorWheel } from './ColorWheel'
import {
  COLOR_GROUPS, contrast, editColors, resetPet, setPetColor, setRole, setSurface,
  type Draft, type PetPart, type Role,
} from './model.ts'
import { Check, HexField } from './ui'

type Sel = Role | 'bg' | 'borderColor' | 'gradStart' | 'gradEnd' | `pet:${PetPart}`

const GRADIENT: { id: Sel; label: string }[] = [{ id: 'gradStart', label: 'Start' }, { id: 'gradEnd', label: 'End' }]
const PET_KEY = { body: 'B', light: 'L', shade: 'D' } as const
const PET_NAME: Record<PetPart, string> = { body: 'Clawd body', light: 'Clawd light', shade: 'Clawd shade' }
const isRole = (s: Sel): s is Role => (COLOR_KEYS as readonly string[]).includes(s)
const petPart = (s: Sel): PetPart | undefined => (s.startsWith('pet:') ? (s.slice(4) as PetPart) : undefined)

export function ColorsSection({ draft, look, onDraft, onHover }: { draft: Draft; look: Look; onDraft(d: Draft): void; onHover(role?: Role): void }) {
  const c = draft.colors as ColorsLayer
  const [picked, setPicked] = useState<Sel>('accent')
  const [held, setHeld] = useState(false)
  const [separate, setSeparate] = useState(false)
  const gradient = c.gradient
  const sel = !gradient && (picked === 'gradStart' || picked === 'gradEnd') ? 'accent' : picked
  const part = petPart(sel)

  const petValue = (p: PetPart) => look.pet[p] ?? CLAWD_SHEET.palette[PET_KEY[p]]!
  const value = (s: Sel): string => {
    const p = petPart(s)
    if (p) return petValue(p)
    if (s === 'bg') return c.bg ?? look.bg
    if (s === 'borderColor') return c.borderColor ?? look.borderColor
    if (s === 'gradStart') return gradient?.[0] ?? '#000000'
    if (isRole(s)) return look.theme.colors[s]
    return gradient?.[1] ?? '#000000'
  }
  // setPetColor derives light and shade from the body while they are unset or still equal to that derivation.
  const linked = (p: PetPart) => {
    const have = look.pet[p], body = look.pet.body
    if (p === 'body') return false
    return have === undefined || (body !== undefined && have === mixHex(body, p === 'light' ? '#ffffff' : '#000000', p === 'light' ? 0.3 : 0.25))
  }

  const apply = (s: Sel, hex: string) => {
    const p = petPart(s)
    if (p) onDraft(setPetColor(draft, p, hex) ?? draft)
    else if (isRole(s)) onDraft(setRole(draft, s, hex) ?? draft)
    else if (s === 'bg' || s === 'borderColor') onDraft(setSurface(draft, s, hex) ?? draft)
    else if (gradient) onDraft(editColors(draft, { gradient: s === 'gradStart' ? [hex, gradient[1]] : [gradient[0], hex] }))
  }

  const nameOf = (s: Sel): string => {
    const p = petPart(s)
    if (p) return PET_NAME[p]
    for (const g of COLOR_GROUPS) for (const it of g.items) if ('role' in it && it.role === s) return it.label
    return s === 'gradStart' ? 'Gradient start' : 'Gradient end'
  }
  const name = nameOf(sel)
  const lit = (s: Sel) => (isRole(s) ? onHover(s) : onHover())
  const ratio = contrast(value(sel), look.bg)
  const textRatio = contrast(look.theme.colors.text, look.bg)
  const follows = part !== undefined && linked(part) && !separate

  const swatch = (s: Sel, label: string) => (
    <button
      key={s} type="button" className="sw" aria-pressed={sel === s}
      title={isRole(s) ? `${s}: ${ROLE_LABELS[s]}` : undefined}
      onClick={() => { setPicked(s); setSeparate(false) }}
      onMouseEnter={() => lit(s)} onMouseLeave={() => onHover()} onFocus={() => lit(s)} onBlur={() => onHover()}
    >
      <i style={{ background: value(s) }} />
      <span>{label}</span>
    </button>
  )

  return (
    <div className="colors">
      {COLOR_GROUPS.map(g => (
        <div key={g.name} role="group" aria-labelledby={`cg-${g.name}`}>
          <h3 id={`cg-${g.name}`}>{g.name}</h3>
          <div className="swatches">
            {g.items.map(it => ('role' in it ? swatch(it.role, it.label) : swatch(`pet:${it.pet}`, it.label)))}
          </div>
        </div>
      ))}
      <div role="group" aria-labelledby="cg-gradient">
        <h3 id="cg-gradient">Gradient</h3>
        <Check label="Gradient behind the page" checked={!!gradient} onChange={on => onDraft(editColors(draft, { gradient: on ? [look.theme.colors.accent, look.theme.colors.read] : undefined }))} />
        {gradient && <div className="swatches">{GRADIENT.map(g => swatch(g.id, g.label))}</div>}
      </div>

      <div className="pick">
        <p className="pick-name"><b>{name}</b>{isRole(sel) && <span>{ROLE_LABELS[sel]}</span>}</p>
        {part && (
          <div className="pet-row">
            <Pet scale={3} mode={{ kind: 'pose', pose: 'idle' }} palette={look.pet} />
            <button type="button" className="link" onClick={() => { onDraft(resetPet(draft)); setSeparate(false) }}>Reset Clawd</button>
          </div>
        )}
        {follows ? (
          <div className="pet-link">
            <p>Light and shade follow the body.</p>
            <Check label="Edit separately" checked={false} onChange={() => setSeparate(true)} />
          </div>
        ) : (
          <>
            <div
              className="pick-edit"
              onPointerDown={() => { setHeld(true); lit(sel) }}
              onPointerUp={() => { setHeld(false); onHover() }} onPointerCancel={() => { setHeld(false); onHover() }}
              onFocus={() => lit(sel)} onBlur={() => { if (!held) onHover() }}
            >
              <ColorWheel hex={value(sel)} label={name} onChange={hex => apply(sel, hex)} />
              <div className="pick-side">
                <HexField label={name} value={value(sel)} onCommit={hex => apply(sel, hex)} />
                {sel !== 'bg' && !part && <p className="ratio">{ratio.toFixed(1)}:1 on background</p>}
              </div>
            </div>
            {part && part !== 'body' && separate && <Check label="Edit separately" checked onChange={() => setSeparate(false)} />}
          </>
        )}
      </div>
      <p className="warn" role="status">{textRatio < 4.5 ? `Text on background is ${textRatio.toFixed(1)}:1; under 4.5:1 is hard to read.` : ''}</p>
    </div>
  )
}
