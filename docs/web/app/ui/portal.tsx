import { createContext, useContext } from 'react'

// The element popups portal into. It is the .landing root, because the pack's colors are custom properties set
// there and a popup portalled to <body> would render without them.
export const PortalContext = createContext<HTMLElement | null>(null)

export const usePortal = () => useContext(PortalContext)
