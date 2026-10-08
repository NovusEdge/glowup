import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { Look } from './data.ts'
import { lookVars, packLook } from './look.ts'
import { PortalContext } from '../ui/portal'

export type PackState = { pack: string; theme?: string; look: Look; setPack(name: string): void; setTheme(name?: string): void; hop: number }

export const PackContext = createContext<PackState>(null as unknown as PackState)

export function PackProvider(props: { children: React.ReactNode; initial?: string; look?: Look }) {
  const [pack, setPackName] = useState(props.initial ?? 'classic')
  const [theme, setTheme] = useState<string | undefined>()
  const [hop, setHop] = useState(0)
  const look = useMemo(() => props.look ?? packLook(pack, theme), [props.look, pack, theme])
  const setPack = useCallback((name: string) => { setPackName(name); setTheme(undefined); setHop(h => h + 1) }, [])
  const value = useMemo(() => ({ pack, theme, look, setPack, setTheme, hop }), [pack, theme, look, setPack, hop])
  const [root, setRoot] = useState<HTMLElement | null>(null)
  return (
    <PackContext.Provider value={value}>
      <PortalContext.Provider value={root}>
        <div className="landing" ref={setRoot} style={lookVars(look) as React.CSSProperties}>{props.children}</div>
      </PortalContext.Provider>
    </PackContext.Provider>
  )
}

export function usePack(): PackState {
  return useContext(PackContext)
}
