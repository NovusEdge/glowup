export const REPO = 'https://github.com/NovusEdge/glowup'

// GitHub Pages serves the site under /glowup/. Always ends in a slash.
export const BASE = import.meta.env.BASE_URL

// Prefixes a site path such as `/themes` for use in raw HTML, where the router adds nothing.
export const withBase = (path: string) => BASE + path.replace(/^\//, '')
export const stripBase = (href: string) => (href.startsWith(BASE) ? '/' + href.slice(BASE.length) : href)
