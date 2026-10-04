import { renameSync, rmSync } from 'node:fs'

// At the domain root the router prerenders "/" into index.html and emits the SPA shell as
// __spa-fallback.html. Pages serves 404.html for unknown paths and the router renders its not-found route there.
const out = new URL('../build/client/', import.meta.url)

renameSync(new URL('__spa-fallback.html', out), new URL('404.html', out))
// The single-fetch copy of the search index; the search UI fetches /api/search.
rmSync(new URL('api/search.data', out), { force: true })
