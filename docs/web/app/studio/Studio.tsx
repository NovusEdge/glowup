import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_SETUP, type Setup } from '../landing/data.ts'
import { Dither } from '../landing/Dither'
import { PACK_NAMES } from '../landing/look.ts'
import { PackProvider, usePack } from '../landing/PackContext'
import { Terminal } from '../landing/Terminal'
import { Actions } from './Actions'
import { Controls } from './Controls'
import { draftLook, draftProblems, focusVars, fromHash, startDraft, stateHash, type Draft, type Role } from './model.ts'

const WIDTHS = ['narrow', 'wide', 'fullscreen'] as const
type Width = (typeof WIDTHS)[number]

function Background() {
  return <Dither look={usePack().look} />
}

export function Studio() {
  const [draft, setDraft] = useState(() => startDraft('classic'))
  const [start, setStart] = useState('classic')
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP)
  const [notices, setNotices] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [width, setWidth] = useState<Width>('wide')
  const [hl, setHl] = useState<Role>()
  const { look } = useMemo(() => draftLook(draft), [draft])
  const problem = draftProblems(draft)[0]

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
      <Background />
      <div className="st-root">
        <header className="st-bar">
          <div className="st-id">
            <a className="st-logo" href="/">glow<span>up</span></a>
            <h1 className="st-word">Studio</h1>
            <div className="st-name">
              <input type="text" aria-label="Pack name" value={draft.name} spellCheck={false} onChange={e => edit({ ...draft, name: e.target.value })} />
              {problem && <p role="status">{problem}</p>}
            </div>
          </div>
          <label className="st-from">
            <span>Start from</span>
            <select value={start} onChange={e => { setStart(e.target.value); setDraft(startDraft(e.target.value)) }}>
              <option value="" disabled>Start from…</option>
              {PACK_NAMES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <a className="st-docs" href="/install">Docs</a>
          <Actions draft={draft} setup={setup} blocked={!!problem} />
        </header>
        {notices.length > 0 && (
          <div className="st-notice" role="status">
            <div>{notices.map((n, i) => <p key={i}>{n}</p>)}</div>
            <button type="button" aria-label="Dismiss notices" onClick={() => setNotices([])}>×</button>
          </div>
        )}
        <div className="st-main">
          <aside className="st-side" aria-label="Controls">
            <Controls draft={draft} look={look} setup={setup} onDraft={edit} onSetup={setSetup} onHover={setHl} onTier={setWidth} />
          </aside>
          <section className="st-stage" aria-label="Preview">
            <div className="st-view">
              <div className="seg2" role="group" aria-label="Preview width">
                {WIDTHS.map(w => <button key={w} type="button" aria-pressed={width === w} onClick={() => setWidth(w)}>{w}</button>)}
              </div>
              <p>Band shows in narrow; pane shows in wide and fullscreen.</p>
            </div>
            <div className="studio-preview" data-width={width} style={hl ? (focusVars(look, hl) as React.CSSProperties) : undefined}>
              <Terminal setup={setup} />
            </div>
          </section>
        </div>
      </div>
    </PackProvider>
  )
}
