import { cpSync } from 'node:fs'

// docs/assets is the one copy of the guide images; the guides reference them as assets/x.png on GitHub.
cpSync(new URL('../../assets/', import.meta.url), new URL('../build/client/media/', import.meta.url), { recursive: true })
