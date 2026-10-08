import { useEffect, useRef, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import type { PetFile } from '../landing/data.ts'
import { CheckIcon, DownloadIcon, LinkIcon, SendIcon } from '../ui/icons'
import { usePortal } from '../ui/portal'
import { LINK_MAX, packJson, sendCommand, shareLink, type Draft, type StudioSetup } from './model.ts'

type Shown = { kind: 'send' | 'link'; text: string }

export function Actions({ draft, setup, pet, blocked }: { draft: Draft; setup: StudioSetup; pet?: PetFile; blocked: boolean }) {
  const [copied, setCopied] = useState<string>()
  const [shown, setShown] = useState<Shown>()
  const box = useRef<HTMLDivElement>(null)
  const linkBtn = useRef<HTMLButtonElement>(null)
  const sendBtn = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const container = usePortal()
  // The popup keeps its last content while it animates out.
  const last = useRef<Shown>(undefined)
  if (shown) last.current = shown
  const pop = shown ?? last.current
  useEffect(() => () => clearTimeout(timer.current), [])

  const selectAll = (el: HTMLElement | null) => {
    if (!el) return
    const range = document.createRange()
    range.selectNodeContents(el)
    getSelection()?.removeAllRanges()
    getSelection()?.addRange(range)
  }

  // A press or focus move onto the action buttons is not "away": the send button toggles the popover itself,
  // and closing here first would make that click open it again.
  const onOpenChange = (open: boolean, details: Popover.Root.ChangeEventDetails) => {
    if (open) return
    const e = details.event as Event & { relatedTarget?: EventTarget | null }
    const to = (e.type === 'focusout' ? e.relatedTarget : e.target) as Node | null
    if (to && box.current?.contains(to)) return
    setShown(undefined)
  }

  // navigator.clipboard is undefined outside secure contexts; the popover then shows the text, selected, to copy by hand.
  const copy = (kind: Shown['kind'], text: string) => {
    if (kind === 'link') setShown(undefined)
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
      <button ref={linkBtn} type="button" className="btn btn-primary" disabled={blocked} onClick={() => copy('link', shareLink(draft))}>
        {copied === 'link' ? <CheckIcon /> : <LinkIcon />}{copied === 'link' ? 'Copied' : 'Copy share link'}
      </button>
      <button ref={sendBtn} type="button" className="btn btn-secondary" disabled={blocked} aria-expanded={shown?.kind === 'send'} onClick={() => (shown?.kind === 'send' ? setShown(undefined) : copy('send', sendCommand(draft, setup, pet)))}>
        {copied === 'send' ? <CheckIcon /> : <SendIcon />}{copied === 'send' ? 'Copied' : 'Send to my Claude'}
      </button>
      <button type="button" className="btn btn-secondary" disabled={blocked} onClick={download}><DownloadIcon />Download pack.json</button>
      <Popover.Root open={!!shown} onOpenChange={onOpenChange}>
        <Popover.Portal container={container}>
          <Popover.Positioner className="pop-positioner" anchor={pop?.kind === 'link' ? linkBtn : sendBtn} align="end" sideOffset={8} collisionPadding={12}>
            <Popover.Popup className="pop st-pop" aria-label={pop?.kind === 'send' ? 'Send to my Claude' : 'Share link'}>
              <Popover.Title className="st-pop-title">{pop?.kind === 'send' ? 'Paste this into Claude Code' : 'Copy this link'}</Popover.Title>
              <code ref={selectAll} tabIndex={0}>{pop?.text}</code>
              {pop?.kind === 'link' && pop.text.length > LINK_MAX && <p className="note">This link is long; some chat apps cut it. Download pack.json instead if it fails.</p>}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
