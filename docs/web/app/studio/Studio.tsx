import { useEffect, useMemo, useRef, useState } from 'react'
import { PACK_NAMES } from '../landing/look.ts'
import { PackProvider } from '../landing/PackContext'
import { Terminal } from '../landing/Terminal'
import { Actions } from './Actions'
import { Controls } from './Controls'
import { DEFAULT_STUDIO_SETUP, draftLook, draftProblems, focusVars, fromHash, startDraft, stateHash, type Draft, type Role, type StudioSetup } from './model.ts'

const WIDTHS = ['narrow', 'wide', 'fullscreen'] as const
type Width = (typeof WIDTHS)[number]
// Natural size of the mock at scale 1 (the frame includes the 36 px toolbar); the scale is how far the preview area exceeds it.
const NARROW_W = 480, WIDE_W = 820, NATURAL_H = 600, MAX_Z = 1.6

export function Studio() {
  const [draft, setDraft] = useState(() => startDraft('classic'))
  const [start, setStart] = useState('classic')
  const [setup, setSetup] = useState<StudioSetup>(DEFAULT_STUDIO_SETUP)
  const [notices, setNotices] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [width, setWidth] = useState<Width>('wide')
  const [hl, setHl] = useState<Role>()
  const [z, setZ] = useState(1)
  const area = useRef<HTMLDivElement>(null)
  const { look } = useMemo(() => draftLook(draft), [draft])
  const problem = useMemo(() => draftProblems(draft)[0], [draft])

  // The mock is sized for its natural width and scales up with the preview area. Phones keep 1 because the stage
  // there is a short scrolling strip, and measuring its height would feed back into the size.
  useEffect(() => {
    const el = area.current
    if (!el) return
    const desk = matchMedia('(min-width:900px)')
    const measure = () => {
      const fit = desk.matches ? Math.min(el.clientWidth / (width === 'narrow' ? NARROW_W : WIDE_W), el.clientHeight / NATURAL_H) : 1
      setZ(Math.round(Math.min(MAX_Z, Math.max(1, fit)) * 100) / 100)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    desk.addEventListener('change', measure)
    return () => { ro.disconnect(); desk.removeEventListener('change', measure) }
  }, [width])

  // Any edit leaves the Start from select on its placeholder, so every pack, the current one too, can be picked again.
  const edit = (d: Draft) => { setStart(''); setDraft(d) }

  useEffect(() => {
    const r = fromHash(location.hash)
    if (r.draft) { setDraft(r.draft); setStart('') }
    if (r.setup) setSetup(r.setup)
    setNotices(r.notices)
    setReady(true)
  }, [])

  // Waits for the hash read: StrictMode runs the mount effect twice, and a write first would erase the link.
  useEffect(() => {
    if (ready) history.replaceState(null, '', stateHash(draft, setup))
  }, [ready, draft, setup])

  return (
    <PackProvider look={look}>
      <div className="st-root">
        <header className="st-bar">
          <div className="st-id">
            <a className="st-logo" href="/">glow<span>up</span></a>
            <a className="st-docs" href="/install">Docs</a>
            <h1 className="st-word">Studio</h1>
          </div>
          <div className="st-name">
            <label>
              <span>Pack name</span>
              <input type="text" value={draft.name} spellCheck={false} aria-invalid={!!problem} onChange={e => edit({ ...draft, name: e.target.value })} />
            </label>
            <p role="status">{problem}</p>
          </div>
          <label className="st-from">
            <span>Start from</span>
            <select value={start} onChange={e => { setStart(e.target.value); setDraft(startDraft(e.target.value)) }}>
              <option value="" disabled>Choose a pack</option>
              {PACK_NAMES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <Actions draft={draft} setup={setup} blocked={!!problem} />
        </header>
        <div role="status">
          {notices.length > 0 && (
            <div className="st-notice">
              <div>{notices.map((n, i) => <p key={i}>{n}</p>)}</div>
              <button type="button" aria-label="Dismiss notices" onClick={() => setNotices([])}>×</button>
            </div>
          )}
        </div>
        <div className="st-main">
          <aside className="st-side" aria-label="Controls">
            <Controls draft={draft} look={look} setup={setup} onDraft={edit} onSetup={setSetup} onHover={setHl} onTier={setWidth} />
          </aside>
          <section className="st-stage" aria-label="Preview">
            <div className="studio-preview" ref={area} data-width={width} style={hl ? (focusVars(look, hl) as React.CSSProperties) : undefined}>
              <div className="st-frame" style={{ ['--z' as string]: z }}>
                <div className="st-view">
                  <div className="st-seg" role="group" aria-label="Preview width">
                    {WIDTHS.map(w => <button key={w} type="button" aria-pressed={width === w} onClick={() => setWidth(w)}>{w}</button>)}
                  </div>
                  <p>Band items (combo, agents, meter) show in narrow; the pane shows in wide and fullscreen.</p>
                </div>
                <Terminal setup={setup} interactive scale={z} />
              </div>
            </div>
          </section>
        </div>
      </div>
    </PackProvider>
  )
}
