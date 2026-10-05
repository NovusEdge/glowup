import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SETUP, type Setup } from '../landing/data.ts'
import { Dither } from '../landing/Dither'
import { Footer } from '../landing/Footer'
import { Nav } from '../landing/Nav'
import { PackProvider, usePack } from '../landing/PackContext'
import { Terminal } from '../landing/Terminal'
import { Controls } from './Controls'
import { LINK_MAX, draftLook, draftProblems, focusVars, fromHash, packJson, sendCommand, shareLink, startDraft, stateHash, type Draft, type Role } from './model.ts'

const WIDTHS = ['narrow', 'wide', 'fullscreen'] as const
type Width = (typeof WIDTHS)[number]

function Background() {
  return <Dither look={usePack().look} />
}

function Output({ draft, setup, blocked }: { draft: Draft; setup: Setup; blocked: boolean }) {
  const [copied, setCopied] = useState<string>()
  const code = useRef<HTMLElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const command = sendCommand(draft, setup)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(undefined), 1500)
    }, () => {
      const el = code.current
      if (!el) return
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    })
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([packJson(draft)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${draft.name}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="out" aria-label="Get it">
      <h2>Get it</h2>
      <div className="btns">
        <button type="button" disabled={blocked} onClick={() => copy('link', shareLink(draft))}>{copied === 'link' ? 'Copied' : 'Copy share link'}</button>
        <button type="button" disabled={blocked} onClick={() => copy('send', command)}>{copied === 'send' ? 'Copied' : 'Send to my Claude'}</button>
        <button type="button" disabled={blocked} onClick={download}>Download pack.json</button>
      </div>
      <p className="hint">Paste this into Claude Code</p>
      <code ref={code} className="cmd">{command}</code>
      {command.length > LINK_MAX && <p className="note">This link is long; some chat apps cut it. Download pack.json instead if it fails.</p>}
    </section>
  )
}

export function Studio() {
  const [draft, setDraft] = useState(() => startDraft('classic'))
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP)
  const [notices, setNotices] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [width, setWidth] = useState<Width>('wide')
  const [hl, setHl] = useState<Role>()
  const { look } = useMemo(() => draftLook(draft), [draft])
  const blocked = draftProblems(draft).length > 0

  useEffect(() => {
    const r = fromHash(location.hash)
    if (r.draft) setDraft(r.draft)
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
      <Nav />
      <main className="wrap studio">
        <h1 className="st-title">Studio</h1>
        <div className="st-grid">
          <div className="st-side">
            <div className="st-view">
              <div className="seg2" role="group" aria-label="Preview width">
                {WIDTHS.map(w => <button key={w} type="button" aria-pressed={width === w} onClick={() => setWidth(w)}>{w}</button>)}
              </div>
              <div className="studio-preview" data-width={width} style={hl ? (focusVars(look, hl) as React.CSSProperties) : undefined}>
                <Terminal setup={setup} />
              </div>
            </div>
            <Output draft={draft} setup={setup} blocked={blocked} />
          </div>
          <div className="st-controls">
            {notices.length > 0 && (
              <div className="st-notice" role="status">
                <div>{notices.map((n, i) => <p key={i}>{n}</p>)}</div>
                <button type="button" aria-label="Dismiss notices" onClick={() => setNotices([])}>×</button>
              </div>
            )}
            <Controls
              draft={draft} setup={setup} onDraft={setDraft} onSetup={setSetup} onHover={setHl}
              onStart={pack => setDraft(startDraft(pack))}
            />
          </div>
        </div>
      </main>
      <div className="wrap"><Footer /></div>
    </PackProvider>
  )
}
