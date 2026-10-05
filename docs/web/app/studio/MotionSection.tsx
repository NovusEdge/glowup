import { DITHERS, FIELD_IDS, FIELD_KNOBS, SPINNER_IDS, type Look } from '../landing/data.ts'
import { editMotion, setField, type Draft } from './model.ts'
import { ColorPick, Select } from './ui'

const SHIMMER = ['off', 'soft', 'strong'] as const
const KNOB_LABEL: Record<string, string> = { offsetX: 'Offset x', offsetY: 'Offset y', fps: 'Frame rate' }
const knobLabel = (k: string) => KNOB_LABEL[k] ?? k[0]!.toUpperCase() + k.slice(1)
const step = (k: string) => (k === 'size' || k === 'rotation' || k === 'fps' ? 1 : k === 'warp' ? 0.1 : 0.05)

export function MotionSection({ draft, look, onDraft }: { draft: Draft; look: Look; onDraft(d: Draft): void }) {
  const m = draft.motion
  const field = look.motion.field
  const motion = (patch: Parameters<typeof editMotion>[1]) => onDraft(editMotion(draft, patch))
  return (
    <>
      <div className="cols2">
        <Select label="Spinner" value={look.motion.spinner} options={SPINNER_IDS} onChange={spinner => motion({ spinner })} />
        <ColorPick label="Spinner color" value={m.color ?? look.motion.color} onChange={color => motion({ color })} />
      </div>
      <div role="radiogroup" aria-labelledby="mo-shimmer">
        <h3 id="mo-shimmer">Shimmer</h3>
        <div className="checks">
          {SHIMMER.map((label, i) => (
            <label key={label} className="chk">
              <input type="radio" name="shimmer" checked={look.motion.shimmer === i} onChange={() => motion({ shimmer: i as 0 | 1 | 2 })} /> {label}
            </label>
          ))}
        </div>
      </div>
      <div role="group" aria-labelledby="mo-field">
        <h3 id="mo-field">Pane field</h3>
        <Select label="Shape" value={field.shape} options={FIELD_IDS} onChange={shape => onDraft(setField(draft, { shape }))} />
      </div>
      {field.shape !== 'none' && (
        <>
          <div className="knobs">
            {Object.entries(FIELD_KNOBS).map(([k, [lo, hi]]) => {
              const v = field[k as keyof typeof FIELD_KNOBS]
              return (
                <label key={k} className="fld knob">
                  <span>{knobLabel(k)}<output>{v}</output></span>
                  <input type="range" min={lo} max={hi} step={step(k)} value={v} onChange={e => onDraft(setField(draft, { [k]: Number(e.target.value) }))} />
                </label>
              )
            })}
          </div>
          <div className="cols2">
            <Select label="Dither" value={field.dither} options={DITHERS} onChange={dither => onDraft(setField(draft, { dither }))} />
            <ColorPick label="Field color" value={field.color ?? look.theme.colors.faint} onChange={color => onDraft(setField(draft, { color }))} />
          </div>
        </>
      )}
    </>
  )
}
