import { useState } from 'react'
import { BORDERS, METER_STYLES, ROW_STYLES, type ColorsLayer, type Look } from '../landing/data.ts'
import { ColorsSection } from './ColorsSection'
import { MotionSection } from './MotionSection'
import { PetSection } from './PetSection'
import { SetupControls } from './SetupControls'
import { StatusSection } from './StatusSection'
import { ThemeSection } from './ThemeSection'
import { editColors, type Draft, type Role, type StudioPet, type StudioSetup } from './model.ts'
import { Check, Select } from './ui'
import { ChevronRightIcon } from '../ui/icons'

type Props = {
  draft: Draft; look: Look; setup: StudioSetup; pet?: StudioPet
  onPet(p?: StudioPet): void; onDraft(d: Draft): void; onSetup(s: StudioSetup): void; onHover(role?: Role): void; onTier(w: 'narrow' | 'wide'): void
}

const SECTIONS = ['Theme', 'Colors', 'Rows & meters', 'Motion', 'Status line', 'Setup', 'Pet'] as const
type Section = (typeof SECTIONS)[number]

export function Controls({ draft, look, setup, pet, onPet, onDraft, onSetup, onHover, onTier }: Props) {
  const [open, setOpen] = useState<Section | undefined>('Theme')
  const colors = (patch: Partial<ColorsLayer>) => onDraft(editColors(draft, patch))

  const body: Record<Section, React.ReactNode> = {
    Theme: <ThemeSection draft={draft} look={look} onDraft={onDraft} />,
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
    Motion: <MotionSection draft={draft} look={look} onDraft={onDraft} />,
    'Status line': <StatusSection setup={setup} onSetup={onSetup} onTier={onTier} />,
    Setup: <SetupControls setup={setup} onSetup={onSetup} onTier={onTier} />,
    Pet: <PetSection pet={pet} onPet={onPet} />,
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
                <ChevronRightIcon width={14} height={14} />
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
