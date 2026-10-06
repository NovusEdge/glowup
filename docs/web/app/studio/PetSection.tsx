import { useMemo, useRef, useState } from 'react'
import { PET_ANIMS, petSheet } from '../landing/data.ts'
import { Pet } from '../landing/Pet'
import { SPEEDS, petFromPixels, type Pixels } from './petpng.ts'
import { petAddCommand, petJson, petOut, petPartSize, petProblems, petRides, type StudioPet } from './model.ts'

const MAX_FILE = 1 << 20
// Memory guard only: the size refusals (frames per row, rows) come from petFromPixels so their messages reach the user.
const MAX_DECODE = 4096

// colorSpaceConversion 'none' keeps the authored bytes: a PNG with a gamma or color profile chunk
// would otherwise come back with shifted colors and more of them.
async function readPng(file: File): Promise<Pixels> {
  const bmp = await createImageBitmap(file, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  if (bmp.width > MAX_DECODE || bmp.height > MAX_DECODE) throw new Error(`The sheet is ${bmp.width} × ${bmp.height} px; that is too large to read.`)
  const cv = document.createElement('canvas')
  cv.width = bmp.width; cv.height = bmp.height
  const x = cv.getContext('2d', { willReadFrequently: true })!
  x.drawImage(bmp, 0, 0)
  return { width: bmp.width, height: bmp.height, data: x.getImageData(0, 0, bmp.width, bmp.height).data }
}

const nameFrom = (file: string) => file.replace(/\.png$/i, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'my-pet'

export function PetSection({ pet, onPet }: { pet?: StudioPet; onPet(p?: StudioPet): void }) {
  const [error, setError] = useState<string>()
  const input = useRef<HTMLInputElement>(null)
  const out = useMemo(() => pet && petOut(pet), [pet])
  const problem = out && petProblems(out)[0]
  const sheet = useMemo(() => out && petSheet(out), [out])

  const upload = async (f?: File) => {
    if (!f) return
    setError(undefined)
    if (f.size > MAX_FILE) return setError('That file is over 1 MB; a pet sheet is a few KB.')
    try {
      const r = petFromPixels(await readPng(f), nameFrom(f.name))
      if ('error' in r) return setError(r.error)
      onPet({ file: r.file, speeds: {} })
    } catch (err) { setError(err instanceof Error ? err.message : 'That file is not a PNG this browser can read.') }
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([petJson(out!)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${out!.name}.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <>
      <p className="hint">Draw your pet as a PNG sprite sheet: one row per animation, 32 × 16 px cells. <a href="/pet-sprites">Sprite spec</a> · <a href="/media/pet-template.png" download>template</a></p>
      <label className="fld">
        <span>Sprite sheet (PNG)</span>
        <input ref={input} type="file" accept="image/png" onChange={e => void upload(e.target.files?.[0])} />
      </label>
      <p className="st-err" role="status">{error ?? problem}</p>
      {pet && out && (
        <>
          <label className="fld">
            <span>Pet name</span>
            <input type="text" value={pet.file.name} spellCheck={false} aria-invalid={!!problem} onChange={e => onPet({ ...pet, file: { ...pet.file, name: e.target.value } })} />
          </label>
          <ul className="petrows">
            {PET_ANIMS.filter(n => pet.file.animations[n]).map(n => {
              const speed = pet.speeds[n] ?? 1
              return (
                <li key={n}>
                  <Pet scale={2} mode={{ kind: 'pose', pose: n }} sheet={sheet} />
                  <label className="fld">
                    <span>{n}<output>{speed}×</output></span>
                    <input type="range" min={0} max={SPEEDS.length - 1} step={1} value={SPEEDS.indexOf(speed)} aria-valuetext={`${speed}×`}
                      onChange={e => onPet({ ...pet, speeds: { ...pet.speeds, [n]: SPEEDS[Number(e.target.value)] } })} />
                  </label>
                </li>
              )
            })}
          </ul>
          <p className="hint">{problem ? '' : petRides(out) ? 'This pet rides along in Send to my Claude.' : `Too big for a link (${(petPartSize(out) / 1024).toFixed(1)} KB encoded, 4 KB max). Download it, then run:`}</p>
          {!problem && !petRides(out) && <code className="cmd">{petAddCommand(out)}</code>}
          <div className="line">
            <button type="button" disabled={!!problem} onClick={download}>Download pet</button>
            <button type="button" onClick={() => { onPet(undefined); if (input.current) input.current.value = '' }}>Remove pet</button>
          </div>
        </>
      )}
    </>
  )
}
