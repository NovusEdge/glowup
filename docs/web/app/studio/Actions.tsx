import { useEffect, useRef, useState } from 'react'
import { LINK_MAX, packJson, sendCommand, shareLink, type Draft, type StudioSetup } from './model.ts'

type Shown = { kind: 'send' | 'link'; text: string }

export function Actions({ draft, setup, blocked }: { draft: Draft; setup: StudioSetup; blocked: boolean }) {
  const [copied, setCopied] = useState<string>()
  const [shown, setShown] = useState<Shown>()
  const box = useRef<HTMLDivElement>(null)
  const code = useRef<HTMLElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    if (!shown) return
    const el = code.current
    if (el) {
      const range = document.createRange()
      range.selectNodeContents(el)
      getSelection()?.removeAllRanges()
      getSelection()?.addRange(range)
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setShown(undefined) }
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setShown(undefined) }
    document.addEventListener('keydown', key)
    document.addEventListener('pointerdown', away)
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', away) }
  }, [shown])

  // navigator.clipboard is undefined outside secure contexts; the popover then shows the text, selected, to copy by hand.
  const copy = (kind: Shown['kind'], text: string) => {
    const done = () => {
      setCopied(kind)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(undefined), 1500)
    }
    const write = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'))
    write.then(done, () => setShown({ kind, text }))
    if (kind === 'send') setShown({ kind, text })
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([packJson(draft)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${draft.name}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <div className="st-actions" ref={box}>
      <button type="button" className="primary" disabled={blocked} onClick={() => copy('link', shareLink(draft))}>{copied === 'link' ? 'Copied' : 'Copy share link'}</button>
      <button type="button" disabled={blocked} aria-expanded={shown?.kind === 'send'} onClick={() => copy('send', sendCommand(draft, setup))}>{copied === 'send' ? 'Copied' : 'Send to my Claude'}</button>
      <button type="button" disabled={blocked} onClick={download}>Download pack.json</button>
      {shown && (
        <div className="st-pop" role="dialog" aria-label={shown.kind === 'send' ? 'Send to my Claude' : 'Share link'}>
          <p>{shown.kind === 'send' ? 'Paste this into Claude Code' : 'Copy this link'}</p>
          <code ref={code}>{shown.text}</code>
          {shown.text.length > LINK_MAX && <p className="note">This link is long; some chat apps cut it. Download pack.json instead if it fails.</p>}
        </div>
      )}
    </div>
  )
}
