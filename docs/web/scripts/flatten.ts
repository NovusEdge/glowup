import { copyFileSync, cpSync, rmSync } from 'node:fs'

// With `basename: '/glowup/'` the router writes the pages under build/client/glowup/, while Vite
// writes assets at the top. GitHub Pages serves the artifact root at /glowup/, so the pages move up.
// The SPA fallback at build/client/index.html becomes 404.html first: Pages serves it for unknown
// paths and the router renders its not-found route there.
const out = new URL('../build/client/', import.meta.url)

copyFileSync(new URL('index.html', out), new URL('404.html', out))
cpSync(new URL('glowup/', out), out, { recursive: true })
rmSync(new URL('glowup/', out), { recursive: true })
